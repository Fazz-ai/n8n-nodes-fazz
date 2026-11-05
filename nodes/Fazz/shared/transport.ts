import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IN8nHttpFullResponse,
	INode,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export type FazzFunctions = IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions;

/**
 * The API root for the address people open Fazz at. Accepts the address with or
 * without a trailing slash, and with `/api/v1` already in it.
 */
export function apiRoot(baseUrl: string): string {
	const origin = baseUrl
		.trim()
		.replace(/\/+$/, '')
		.replace(/\/api\/v1$/, '');

	return `${origin}/api/v1`;
}

type FazzErrorBody = {
	error?: {
		code?: string;
		message?: string;
		errors?: Record<string, string[]>;
		retry_after?: number;
		closed_at?: string | null;
		candidates?: Array<{ id: number; name: string }>;
	};
};

/**
 * What to tell the person, by the stable error code. The API message is kept
 * as the main text; this adds how to solve it, when there is a known way.
 */
const HINTS: Record<string, string> = {
	unauthenticated:
		'Check the API key in the credential. A revoked key, or one from another Fazz address, is refused.',
	connection_inactive:
		'The server connection was paused or revoked in Fazz. Create a new key under Settings › Integrations › Server API.',
	recipient_not_allowed:
		'The connection is in test mode: only the numbers on its test list receive messages. Add the number, or turn test mode off in Fazz.',
	window_closed:
		'The 24-hour window with this contact is closed. Send an approved template instead.',
	limit_reached:
		"The team's sending allowance is used up. Wait and try again, or ask Fazz for a larger allowance.",
	rate_limited: 'Too many requests in one minute. Add a Wait node or reduce the batch size.',
	duplicate_send:
		'The same idempotency key was used for a different message. Use a key that changes with the message.',
	template_not_found: 'Pick the template again from the list: it may have been renamed or deleted.',
	instance_offline: 'The WhatsApp number is disconnected in Fazz. Reconnect it and try again.',
	validation_failed: 'Check the fields listed below.',
};

export function fazzApiError(
	node: INode,
	statusCode: number,
	body: unknown,
	itemIndex?: number,
): NodeApiError {
	const error = ((body ?? {}) as FazzErrorBody).error ?? {};
	const code = error.code ?? 'http_error';
	const message = error.message ?? `Fazz answered with HTTP ${statusCode}`;
	const details: string[] = [];

	if (HINTS[code] !== undefined) {
		details.push(HINTS[code]);
	}

	for (const [field, messages] of Object.entries(error.errors ?? {})) {
		details.push(`${field}: ${messages.join(' ')}`);
	}

	if (error.retry_after !== undefined) {
		details.push(`Retry after ${error.retry_after} seconds.`);
	}

	if (error.candidates !== undefined && error.candidates.length > 0) {
		details.push(
			`Contacts with this phone: ${error.candidates.map((c) => `${c.name} (${c.id})`).join(', ')}. Use 'Contact ID' instead.`,
		);
	}

	return new NodeApiError(node, { ...(error as JsonObject), code } as JsonObject, {
		message: `${message} [${code}]`,
		description: details.join('\n') || undefined,
		httpCode: String(statusCode),
		itemIndex,
	});
}

/**
 * One call to the Fazz server API, authenticated by the `fazzApi` credential.
 *
 * HTTP errors are read here, not by n8n, so every refusal becomes a
 * `NodeApiError` that carries the API's stable `code` and the hint to solve it.
 */
export async function fazzApiRequest(
	this: FazzFunctions,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
	itemIndex?: number,
): Promise<unknown> {
	const credentials = await this.getCredentials('fazzApi');
	const options: IHttpRequestOptions = {
		method,
		url: `${apiRoot(String(credentials.baseUrl))}${path}`,
		headers: { Accept: 'application/json' },
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};

	if (body !== undefined) {
		options.body = body;
	}

	if (qs !== undefined) {
		options.qs = qs;
	}

	let response: IN8nHttpFullResponse;

	try {
		response = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'fazzApi',
			options,
		)) as IN8nHttpFullResponse;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject, {
			message: 'Fazz could not be reached',
			description: `Check the Base URL in the credential (${String(credentials.baseUrl)}).`,
			itemIndex,
		});
	}

	if (response.statusCode >= 400) {
		throw fazzApiError(this.getNode(), response.statusCode, response.body, itemIndex);
	}

	return response.body;
}

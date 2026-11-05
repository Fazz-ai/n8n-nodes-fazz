import type {
	IDataObject,
	IHookFunctions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { verifyFazzSignature } from '../Fazz/shared/signature';
import { fazzApiRequest } from '../Fazz/shared/transport';

/** What Fazz keeps about the webhook this node created, in the workflow's static data. */
type WebhookState = {
	webhookId?: number;
	webhookSecret?: string;
	webhookUrl?: string;
	webhookEvents?: string[];
};

type FazzWebhook = { id: number; url: string; events: string[]; status: string };

/** The event the "Send test" button in Fazz sends. It never starts the workflow. */
export const TEST_EVENT = 'webhook.test';

export function sameEvents(a: string[] | undefined, b: string[]): boolean {
	return a !== undefined && a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

export function webhookName(workflowName: string | undefined): string {
	const name = `n8n · ${(workflowName ?? '').trim() || 'workflow'}`;

	return name.length > 60 ? `${name.slice(0, 59)}…` : name;
}

export class FazzTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Fazz Trigger',
		name: 'fazzTrigger',
		icon: { light: 'file:fazz.svg', dark: 'file:fazz.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when something happens in Fazz',
		defaults: { name: 'Fazz Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'fazzApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'Fazz only calls public https addresses. If n8n runs on your computer or on a private network, set its WEBHOOK_URL to a public https address (a tunnel works) before activating.',
				name: 'publicUrlNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Event Names or IDs',
				name: 'events',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getEvents' },
				required: true,
				default: [],
				description:
					'The events that start the workflow. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	};

	methods = {
		loadOptions: {
			async getEvents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const events = (await fazzApiRequest.call(this, 'GET', '/events')) as Array<{
					event: string;
					description: string;
				}>;

				return events.map((event) => ({
					name: event.event,
					value: event.event,
					description: event.description,
				}));
			},
		},
	};

	webhookMethods = {
		default: {
			/**
			 * The webhook exists when Fazz still has the one this node created,
			 * for this same URL and these same events. Anything else is removed
			 * and created again, with a new secret.
			 */
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const state = this.getWorkflowStaticData('node') as WebhookState;
				const url = this.getNodeWebhookUrl('default') as string;
				const events = this.getNodeParameter('events') as string[];

				if (state.webhookId === undefined) {
					return false;
				}

				const webhooks = (await fazzApiRequest.call(this, 'GET', '/webhooks')) as FazzWebhook[];
				const current = webhooks.find((webhook) => webhook.id === state.webhookId);

				if (
					current !== undefined &&
					current.url === url &&
					current.status === 'active' &&
					state.webhookSecret !== undefined &&
					sameEvents(current.events, events)
				) {
					return true;
				}

				if (current !== undefined) {
					await fazzApiRequest.call(this, 'DELETE', `/webhooks/${current.id}`);
				}

				clearState(state);

				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const state = this.getWorkflowStaticData('node') as WebhookState;
				const url = this.getNodeWebhookUrl('default') as string;
				const events = this.getNodeParameter('events') as string[];

				if (events.length === 0) {
					throw new NodeOperationError(this.getNode(), 'Choose at least one event', {
						description: "Pick the events that start this workflow in 'Event Names or IDs'.",
					});
				}

				let webhook: FazzWebhook & { secret: string | null };

				try {
					webhook = (await fazzApiRequest.call(this, 'POST', '/webhooks', {
						name: webhookName(this.getWorkflow().name),
						url,
						events,
					})) as FazzWebhook & { secret: string | null };
				} catch (error) {
					const failure =
						error instanceof NodeApiError
							? error
							: new NodeApiError(this.getNode(), error as JsonObject);

					if (failure.httpCode === '422' && /url/i.test(failure.description ?? '')) {
						failure.description = `Fazz could not use ${url}. It only calls public https addresses on the default port: set n8n's WEBHOOK_URL to a public https address (a tunnel works) and activate again.\n${failure.description ?? ''}`;
					}

					throw failure;
				}

				if (!webhook.secret) {
					throw new NodeOperationError(this.getNode(), 'Fazz did not return the webhook secret', {
						description: 'Deactivate and activate the workflow again.',
					});
				}

				state.webhookId = webhook.id;
				state.webhookSecret = webhook.secret;
				state.webhookUrl = url;
				state.webhookEvents = events;

				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const state = this.getWorkflowStaticData('node') as WebhookState;

				if (state.webhookId !== undefined) {
					try {
						await fazzApiRequest.call(this, 'DELETE', `/webhooks/${state.webhookId}`);
					} catch (error) {
						// Already gone in Fazz (deleted by hand, or the key was
						// revoked): nothing left to clean up there.
						if (
							!(error instanceof NodeApiError) ||
							!['404', '401', '403'].includes(error.httpCode ?? '')
						) {
							return false;
						}
					}
				}

				clearState(state);

				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const state = this.getWorkflowStaticData('node') as WebhookState;
		const request = this.getRequestObject();
		const headers = this.getHeaderData();
		const signature = headers['x-fazz-signature'];

		if (
			!verifyFazzSignature(
				state.webhookSecret ?? '',
				Array.isArray(signature) ? signature[0] : signature,
				request.rawBody ?? JSON.stringify(this.getBodyData()),
			)
		) {
			const response = this.getResponseObject();
			response.status(401).json({ message: 'The signature does not match.' });

			return { noWebhookResponse: true };
		}

		const body = this.getBodyData() as IDataObject;
		const events = this.getNodeParameter('events') as string[];

		if (body.event === TEST_EVENT || !events.includes(String(body.event))) {
			return { webhookResponse: { received: true } };
		}

		return { workflowData: [this.helpers.returnJsonArray(body)] };
	}
}

function clearState(state: WebhookState): void {
	delete state.webhookId;
	delete state.webhookSecret;
	delete state.webhookUrl;
	delete state.webhookEvents;
}

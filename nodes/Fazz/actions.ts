import type { IDataObject, IHttpRequestMethods, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { NamedValue } from './shared/helpers';
import { cleanPhone, compact, templateVariables } from './shared/helpers';

export type ParamValue = IDataObject[string];

/** Reads one parameter of the current item, as `getNodeParameter` does. */
export type ParamReader = (name: string, fallback?: ParamValue) => ParamValue;

export type ApiCall = {
	method: IHttpRequestMethods;
	path: string;
	body?: IDataObject;
	qs?: IDataObject;
};

export type CallContext = {
	node: INode;
	itemIndex: number;
	/** Used when the person did not set an idempotency key of their own. */
	defaultIdempotencyKey: string;
};

/** The value of a resource locator, or of a plain parameter that holds one. */
export function locatorValue(value: unknown): string {
	if (value !== null && typeof value === 'object' && 'value' in value) {
		return String((value as { value: unknown }).value ?? '').trim();
	}

	return String(value ?? '').trim();
}

function positiveId(node: INode, value: unknown, what: string, itemIndex: number): number {
	const id = Number(locatorValue(value));

	if (!Number.isInteger(id) || id <= 0) {
		throw new NodeOperationError(node, `Choose the ${what}`, {
			itemIndex,
			description: `The ${what} must be picked from the list or given as a numeric ID.`,
		});
	}

	return id;
}

function optionalId(value: unknown): number | undefined {
	const id = Number(locatorValue(value));

	return Number.isInteger(id) && id > 0 ? id : undefined;
}

function variables(param: ParamReader, name: string, context: CallContext, from?: IDataObject) {
	const collection = (from ? from[name] : param(name, {})) as
		| { variable?: NamedValue[] }
		| undefined;

	return templateVariables(context.node, collection?.variable, context.itemIndex);
}

function sendOptions(param: ParamReader, context: CallContext): IDataObject {
	const options = param('options', {}) as { idempotencyKey?: string; sendAnyway?: boolean };
	const key = (options.idempotencyKey ?? '').trim();

	return compact({
		idempotency_key: key !== '' ? key : context.defaultIdempotencyKey,
		send_anyway: options.sendAnyway === true ? true : undefined,
	});
}

function recipient(param: ParamReader, context: CallContext): IDataObject {
	const sendTo = param('sendTo') as string;

	if (sendTo === 'conversation') {
		return {
			conversation_id: positiveId(
				context.node,
				param('conversationId'),
				'conversation',
				context.itemIndex,
			),
		};
	}

	if (sendTo === 'contact') {
		return {
			contact_id: positiveId(context.node, param('contactId'), 'contact', context.itemIndex),
		};
	}

	return { to: cleanPhone(String(param('to') ?? '')) };
}

function contactCall(operation: string, param: ParamReader, context: CallContext): ApiCall {
	switch (operation) {
		case 'create': {
			const extra = param('additionalFields', {}) as IDataObject;

			return {
				method: 'POST',
				path: '/contacts',
				body: compact({
					name: param('name'),
					phone: cleanPhone(String(param('phone') ?? '')),
					source: param('source'),
					email: extra.email,
					lead_batch: extra.lead_batch,
					company_name: extra.company_name,
					company_tax_id: extra.company_tax_id,
				}),
			};
		}

		case 'upsert': {
			const extra = param('additionalFields', {}) as IDataObject;

			return {
				method: 'PUT',
				path: '/contacts/by-phone',
				body: compact({
					phone: cleanPhone(String(param('phone') ?? '')),
					name: extra.name,
					email: extra.email,
					source: extra.source,
					lead_batch: extra.lead_batch,
					company_name: extra.company_name,
					company_tax_id: extra.company_tax_id,
				}),
			};
		}

		case 'update': {
			const id = positiveId(context.node, param('contactId'), 'contact', context.itemIndex);
			const fields = param('updateFields', {}) as IDataObject;

			return {
				method: 'PATCH',
				path: `/contacts/${id}`,
				body: compact({
					mode: fields.overwrite === true ? 'overwrite' : 'fill_empty',
					name: fields.name,
					email: fields.email,
					company_name: fields.company_name,
					company_tax_id: fields.company_tax_id,
				}),
			};
		}

		case 'addNote': {
			const id = positiveId(context.node, param('contactId'), 'contact', context.itemIndex);

			return {
				method: 'POST',
				path: `/contacts/${id}/notes`,
				body: { body: String(param('note') ?? '') },
			};
		}

		case 'find': {
			const findBy = param('findBy') as string;

			return {
				method: 'GET',
				path: '/contacts/search',
				qs:
					findBy === 'email'
						? { email: String(param('findEmail') ?? '').trim() }
						: { phone: cleanPhone(String(param('findPhone') ?? '')) },
			};
		}
	}

	throw new NodeOperationError(context.node, `The operation '${operation}' is not supported`, {
		itemIndex: context.itemIndex,
	});
}

function messageCall(operation: string, param: ParamReader, context: CallContext): ApiCall {
	switch (operation) {
		case 'sendTemplate': {
			const extra = param('additionalFields', {}) as IDataObject;
			const buttons = (
				(extra.buttons as { button?: Array<{ index: number; value: string }> })?.button ?? []
			)
				.filter((button) => String(button.value ?? '') !== '')
				.map((button) => ({ index: Number(button.index), value: String(button.value) }));
			const headerUrl = String(extra.headerUrl ?? '').trim();
			const contact = compact({
				name: extra.contactName,
				source: extra.contactSource,
				lead_batch: extra.contactLeadBatch,
			});
			const company = compact({ tax_id: extra.companyTaxId, name: extra.companyName });

			return {
				method: 'POST',
				path: '/messages/template',
				body: compact({
					...recipient(param, context),
					whatsapp_number_id: optionalId(param('whatsappNumberId')),
					template_id: positiveId(context.node, param('templateId'), 'template', context.itemIndex),
					variables: variables(param, 'variables', context),
					header_variables: variables(param, 'headerVariables', context, extra),
					header:
						headerUrl === ''
							? undefined
							: compact({
									type: extra.headerType ?? 'document',
									url: headerUrl,
									filename: extra.headerFilename,
								}),
					buttons: buttons.length > 0 ? buttons : undefined,
					department_id: optionalId(extra.department_id),
					assign_to_user_id: optionalId(extra.assign_to_user_id),
					contact: Object.keys(contact).length > 0 ? contact : undefined,
					company: Object.keys(company).length > 0 ? company : undefined,
					...sendOptions(param, context),
				}),
			};
		}

		case 'sendText': {
			const target = recipient(param, context);

			return {
				method: 'POST',
				path: '/messages/text',
				body: compact({
					...target,
					whatsapp_number_id: 'to' in target ? optionalId(param('whatsappNumberId')) : undefined,
					text: String(param('text') ?? ''),
					...sendOptions(param, context),
				}),
			};
		}

		case 'sendMedia': {
			const target = recipient(param, context);
			const extra = param('additionalFields', {}) as IDataObject;

			return {
				method: 'POST',
				path: '/messages/media',
				body: compact({
					...target,
					whatsapp_number_id: 'to' in target ? optionalId(param('whatsappNumberId')) : undefined,
					type: param('mediaType'),
					url: String(param('mediaUrl') ?? '').trim(),
					filename: extra.filename,
					caption: extra.caption,
					...sendOptions(param, context),
				}),
			};
		}
	}

	throw new NodeOperationError(context.node, `The operation '${operation}' is not supported`, {
		itemIndex: context.itemIndex,
	});
}

/**
 * The API call for one item. Kept apart from `execute` so the mapping from the
 * node's fields to the request body is tested without n8n running.
 */
export function buildCall(
	resource: string,
	operation: string,
	param: ParamReader,
	context: CallContext,
): ApiCall {
	if (resource === 'contact') {
		return contactCall(operation, param, context);
	}

	if (resource === 'message') {
		return messageCall(operation, param, context);
	}

	throw new NodeOperationError(context.node, `The resource '${resource}' is not supported`, {
		itemIndex: context.itemIndex,
	});
}

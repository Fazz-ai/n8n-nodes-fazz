import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import type { ParamValue } from './actions';
import { buildCall } from './actions';
import { contactFields, contactOperations } from './descriptions/ContactDescription';
import { messageFields, messageOperations } from './descriptions/MessageDescription';
import { idempotencyKey } from './shared/helpers';
import { fazzApiRequest } from './shared/transport';

/** `GET /contacts` answers 50 contacts a page. */
const CONTACTS_PER_PAGE = 50;

type Choice = { id: number; name: string };
type Template = Choice & {
	language: string;
	parameter_format?: string;
	variable_keys?: string[];
	preview?: string | null;
};

export class Fazz implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Fazz',
		name: 'fazz',
		icon: { light: 'file:fazz.svg', dark: 'file:fazz.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send WhatsApp messages and manage contacts in Fazz',
		defaults: { name: 'Fazz' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'fazzApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Contact', value: 'contact' },
					{ name: 'Message', value: 'message' },
				],
				default: 'message',
			},
			...messageOperations,
			...messageFields,
			...contactOperations,
			...contactFields,
		],
	};

	methods = {
		loadOptions: {
			async getWhatsappNumbers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const numbers = (await fazzApiRequest.call(this, 'GET', '/whatsapp-numbers')) as Array<
					Choice & { phone: string | null; connected: boolean }
				>;

				return numbers.map((number) => ({
					name: number.phone ? `${number.name} (${number.phone})` : number.name,
					value: number.id,
					description: number.connected ? undefined : 'Disconnected: messages will not go out',
				}));
			},

			async getMembers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const members = (await fazzApiRequest.call(this, 'GET', '/members')) as Choice[];

				return members.map((member) => ({ name: member.name, value: member.id }));
			},

			async getDepartments(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const departments = (await fazzApiRequest.call(this, 'GET', '/departments')) as Choice[];

				return departments.map((department) => ({ name: department.name, value: department.id }));
			},

			async getLeadSources(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const sources = (await fazzApiRequest.call(this, 'GET', '/lead-sources')) as Array<
					Choice & { batches: Choice[] }
				>;

				return sources.map((source) => ({
					name: source.name,
					value: source.name,
					description:
						source.batches.length > 0
							? `Batches: ${source.batches.map((batch) => batch.name).join(', ')}`
							: undefined,
				}));
			},
		},

		listSearch: {
			async searchContacts(
				this: ILoadOptionsFunctions,
				filter?: string,
				paginationToken?: string,
			): Promise<INodeListSearchResult> {
				const page = Number(paginationToken ?? 1);
				const contacts = (await fazzApiRequest.call(this, 'GET', '/contacts', undefined, {
					q: filter ?? '',
					page,
				})) as Array<{ id: number; name: string; phone: string | null }>;

				return {
					results: contacts.map((contact) => ({
						name: contact.phone ? `${contact.name} (${contact.phone})` : contact.name,
						value: String(contact.id),
					})),
					paginationToken: contacts.length === CONTACTS_PER_PAGE ? String(page + 1) : undefined,
				};
			},

			async searchTemplates(
				this: ILoadOptionsFunctions,
				filter?: string,
			): Promise<INodeListSearchResult> {
				const numberId = Number(this.getCurrentNodeParameter('whatsappNumberId'));

				if (!Number.isInteger(numberId) || numberId <= 0) {
					return { results: [] };
				}

				const templates = (await fazzApiRequest.call(this, 'GET', '/templates', undefined, {
					whatsapp_number_id: numberId,
				})) as Template[];
				const term = (filter ?? '').toLowerCase();

				return {
					results: templates
						.filter((template) => term === '' || template.name.toLowerCase().includes(term))
						.map((template) => ({
							name:
								(template.variable_keys ?? []).length > 0
									? `${template.name} (${template.language}) · ${(template.variable_keys ?? []).join(', ')}`
									: `${template.name} (${template.language})`,
							value: String(template.id),
						})),
				};
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const node = this.getNode();

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;

				if (resource === 'contact' && operation === 'getAll') {
					const contacts = await getManyContacts.call(this, itemIndex);
					returnData.push(
						...contacts.map((contact) => ({ json: contact, pairedItem: { item: itemIndex } })),
					);
					continue;
				}

				const runIndex = Number(this.getWorkflowDataProxy(itemIndex).$runIndex ?? 0);
				const call = buildCall(
					resource,
					operation,
					(name, fallback) => this.getNodeParameter(name, itemIndex, fallback) as ParamValue,
					{
						node,
						itemIndex,
						defaultIdempotencyKey: idempotencyKey(
							this.getExecutionId(),
							node.id,
							runIndex,
							itemIndex,
						),
					},
				);
				const response = await fazzApiRequest.call(
					this,
					call.method,
					call.path,
					call.body,
					call.qs,
					itemIndex,
				);
				const results = Array.isArray(response) ? response : [response];

				returnData.push(
					...results.map((json) => ({
						json: json as IDataObject,
						pairedItem: { item: itemIndex },
					})),
				);
			} catch (error) {
				const failure =
					error instanceof NodeApiError || error instanceof NodeOperationError
						? error
						: new NodeOperationError(node, error as Error, { itemIndex });

				if (this.continueOnFail()) {
					returnData.push({
						json: { error: failure.message, ...codeOf(failure) },
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				throw failure;
			}
		}

		return [returnData];
	}
}

function codeOf(error: unknown): IDataObject {
	const code = (error as { errorResponse?: { code?: unknown } }).errorResponse?.code;

	return typeof code === 'string' ? { code } : {};
}

async function getManyContacts(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject[]> {
	const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
	const query = String(filters.query ?? '').trim();
	const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;
	const limit = returnAll ? Infinity : (this.getNodeParameter('limit', itemIndex, 50) as number);
	const contacts: IDataObject[] = [];

	for (let page = 1; contacts.length < limit; page++) {
		const batch = (await fazzApiRequest.call(
			this,
			'GET',
			'/contacts',
			undefined,
			{ q: query, page },
			itemIndex,
		)) as IDataObject[];

		contacts.push(...batch);

		if (batch.length < CONTACTS_PER_PAGE) {
			break;
		}
	}

	return contacts.slice(0, limit);
}

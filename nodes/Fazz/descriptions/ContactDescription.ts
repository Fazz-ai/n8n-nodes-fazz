import type { INodeProperties } from 'n8n-workflow';

const show = (operation: string[]) => ({ show: { resource: ['contact'], operation } });

export const contactLocator: INodeProperties = {
	displayName: 'Contact',
	name: 'contactId',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: { searchListMethod: 'searchContacts', searchable: true },
		},
		{
			displayName: 'ID',
			name: 'id',
			type: 'string',
			placeholder: 'e.g. 1234',
			validation: [
				{
					type: 'regex',
					properties: { regex: '^\\d+$', errorMessage: 'The contact ID is a number' },
				},
			],
		},
	],
};

const companyFields: INodeProperties[] = [
	{
		displayName: 'Company Name',
		name: 'company_name',
		type: 'string',
		default: '',
		description:
			"Links the contact to this company, adding to the companies it already has. Required with 'Company Tax ID': the name used when the company is new.",
	},
	{
		displayName: 'Company Tax ID',
		name: 'company_tax_id',
		type: 'string',
		default: '',
		placeholder: 'e.g. 12.345.678/0001-90',
		description:
			'Brazilian CNPJ, with or without punctuation. Finds the company by its document instead of its name, and never renames an existing one.',
	},
];

const leadBatch: INodeProperties = {
	displayName: 'Lead Batch',
	name: 'lead_batch',
	type: 'string',
	default: '',
	placeholder: 'e.g. October list',
	description: 'Groups contacts inside the lead source',
};

export const contactOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['contact'] } },
		options: [
			{
				name: 'Add Note',
				value: 'addNote',
				description: 'Add an internal note to a contact',
				action: 'Add a note to a contact',
			},
			{
				name: 'Create',
				value: 'create',
				description: 'Create a contact',
				action: 'Create a contact',
			},
			{
				name: 'Create or Update',
				value: 'upsert',
				description: 'Create a new record, or update the current one if it already exists (upsert)',
				action: 'Create or update a contact',
			},
			{
				name: 'Find',
				value: 'find',
				description: 'Find the contact that has a phone or an email',
				action: 'Find a contact',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List contacts, newest first',
				action: 'Get many contacts',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update a contact',
				action: 'Update a contact',
			},
		],
		default: 'create',
	},
];

export const contactFields: INodeProperties[] = [
	/* create */
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		displayOptions: show(['create']),
	},
	{
		displayName: 'Phone',
		name: 'phone',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. +5511987654321',
		description: 'In international format, with the + and the country code',
		displayOptions: show(['create', 'upsert']),
	},
	{
		displayName: 'Lead Source Name or ID',
		name: 'source',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getLeadSources' },
		required: true,
		default: '',
		description:
			'Where the lead came from. A new name, given by expression, creates a new source. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: show(['create']),
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['create']),
		options: [
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'e.g. name@email.com',
				default: '',
			},
			leadBatch,
			...companyFields,
		],
	},

	/* upsert */
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['upsert']),
		options: [
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'e.g. name@email.com',
				default: '',
			},
			leadBatch,
			{
				displayName: 'Lead Source Name or ID',
				name: 'source',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getLeadSources' },
				default: '',
				description:
					'Where the lead came from. Required when the contact is created. A new name, given by expression, creates a new source. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
			},
			...companyFields,
		],
	},

	/* update, addNote */
	{
		...contactLocator,
		displayOptions: show(['update', 'addNote']),
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['update']),
		options: [
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'e.g. name@email.com',
				default: '',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Overwrite Existing Values',
				name: 'overwrite',
				type: 'boolean',
				default: false,
				description:
					'Whether to replace values the contact already has. By default only empty fields are filled.',
			},
			...companyFields,
		],
	},
	{
		displayName: 'Note',
		name: 'note',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		description: 'Visible only to the team, on the contact',
		displayOptions: show(['addNote']),
	},

	/* find */
	{
		displayName: 'Find By',
		name: 'findBy',
		type: 'options',
		options: [
			{ name: 'Phone', value: 'phone' },
			{ name: 'Email', value: 'email' },
		],
		default: 'phone',
		displayOptions: show(['find']),
	},
	{
		displayName: 'Phone',
		name: 'findPhone',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. +5511987654321',
		displayOptions: { show: { resource: ['contact'], operation: ['find'], findBy: ['phone'] } },
	},
	{
		displayName: 'Email',
		name: 'findEmail',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. name@email.com',
		displayOptions: { show: { resource: ['contact'], operation: ['find'], findBy: ['email'] } },
	},

	/* getAll */
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: show(['getAll']),
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { resource: ['contact'], operation: ['getAll'], returnAll: [false] } },
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show(['getAll']),
		options: [
			{
				displayName: 'Search',
				name: 'query',
				type: 'string',
				default: '',
				placeholder: 'e.g. Maria',
				description: 'Part of the name, email or phone',
			},
		],
	},
];

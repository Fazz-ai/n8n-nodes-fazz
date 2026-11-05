import type { INodeProperties } from 'n8n-workflow';
import { contactLocator } from './ContactDescription';

const show = (operation: string[], extra: Record<string, string[]> = {}) => ({
	show: { resource: ['message'], operation, ...extra },
});

const namedValues = (displayName: string, name: string, description: string): INodeProperties => ({
	displayName,
	name,
	type: 'fixedCollection',
	typeOptions: { multipleValues: true, sortable: true },
	placeholder: 'Add Variable',
	default: {},
	description,
	options: [
		{
			displayName: 'Variable',
			name: 'variable',
			values: [
				{
					displayName: 'Name',
					name: 'name',
					type: 'string',
					default: '',
					placeholder: 'e.g. customer_name',
					description: 'Only for a template with named variables. Leave empty to send in order.',
				},
				{
					displayName: 'Value',
					name: 'value',
					type: 'string',
					default: '',
				},
			],
		},
	],
});

const sendOptions = (operation: string[]): INodeProperties[] => [
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(operation),
		options: [
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				placeholder: 'e.g. invoice-{{ $json.invoiceId }}',
				description:
					'Sending again with the same key returns the first answer instead of a second message. By default the node uses a key per execution and item, so a retry never sends twice; set your own to protect across executions too.',
			},
			{
				displayName: 'Send Anyway',
				name: 'sendAnyway',
				type: 'boolean',
				default: false,
				description: 'Whether to send even to a number Fazz found not to be on WhatsApp',
			},
		],
	},
];

export const messageOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['message'] } },
		options: [
			{
				name: 'Send Media',
				value: 'sendMedia',
				description: 'Send an image, video, audio or document while the 24-hour window is open',
				action: 'Send a media message',
			},
			{
				name: 'Send Template',
				value: 'sendTemplate',
				description: 'Send an approved WhatsApp template, at any time',
				action: 'Send a template message',
			},
			{
				name: 'Send Text',
				value: 'sendText',
				description: 'Send free text while the 24-hour window is open',
				action: 'Send a text message',
			},
		],
		default: 'sendTemplate',
	},
];

export const messageFields: INodeProperties[] = [
	/* recipient */
	{
		displayName: 'Send To',
		name: 'sendTo',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Phone Number', value: 'phone' },
			{ name: 'Contact', value: 'contact' },
		],
		default: 'phone',
		displayOptions: show(['sendTemplate']),
	},
	{
		displayName: 'Send To',
		name: 'sendTo',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Phone Number', value: 'phone' },
			{ name: 'Conversation', value: 'conversation' },
		],
		default: 'phone',
		displayOptions: show(['sendText', 'sendMedia']),
	},
	{
		displayName: 'Phone',
		name: 'to',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. +5511987654321',
		description: 'In international format, with the + and the country code',
		displayOptions: show(['sendTemplate', 'sendText', 'sendMedia'], { sendTo: ['phone'] }),
	},
	{
		...contactLocator,
		displayOptions: show(['sendTemplate'], { sendTo: ['contact'] }),
	},
	{
		displayName: 'Conversation ID',
		name: 'conversationId',
		type: 'number',
		required: true,
		default: 0,
		description: 'The conversation ID from a Fazz Trigger event or from an earlier send',
		displayOptions: show(['sendText', 'sendMedia'], { sendTo: ['conversation'] }),
	},
	{
		displayName: 'WhatsApp Number Name or ID',
		name: 'whatsappNumberId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getWhatsappNumbers' },
		required: true,
		default: '',
		description:
			'The team number the message goes out from. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: show(['sendTemplate']),
	},
	{
		displayName: 'WhatsApp Number Name or ID',
		name: 'whatsappNumberId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getWhatsappNumbers' },
		required: true,
		default: '',
		description:
			'The team number the message goes out from. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: show(['sendText', 'sendMedia'], { sendTo: ['phone'] }),
	},

	/* template */
	{
		displayName: 'Template',
		name: 'templateId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchTemplates', searchable: true },
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 42',
				validation: [
					{
						type: 'regex',
						properties: { regex: '^\\d+$', errorMessage: 'The template ID is a number' },
					},
				],
			},
		],
		description: 'Only approved templates of the chosen WhatsApp number are listed',
		displayOptions: show(['sendTemplate']),
	},
	{
		...namedValues(
			'Variables',
			'variables',
			"The template body variables, in order. For a template with named variables, fill every 'Name'.",
		),
		displayOptions: show(['sendTemplate']),
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['sendTemplate']),
		options: [
			{
				displayName: 'Assign To Name or ID',
				name: 'assign_to_user_id',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getMembers' },
				default: '',
				description:
					'The member who takes the conversation. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Buttons',
				name: 'buttons',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Button',
				default: {},
				description:
					'The value of each button that needs one, such as a URL suffix or a coupon code',
				options: [
					{
						displayName: 'Button',
						name: 'button',
						values: [
							{
								displayName: 'Index',
								name: 'index',
								type: 'number',
								typeOptions: { minValue: 0, maxValue: 9 },
								default: 0,
								description: 'The button position, starting at 0',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
							},
						],
					},
				],
			},
			{
				displayName: 'Company Name',
				name: 'companyName',
				type: 'string',
				default: '',
				description:
					'When the recipient answers for several companies, the one this message is about. Used when Fazz does not know the company yet.',
			},
			{
				displayName: 'Company Tax ID',
				name: 'companyTaxId',
				type: 'string',
				default: '',
				placeholder: 'e.g. 12.345.678/0001-90',
				description:
					'Brazilian CNPJ of the company this message is about. The team sees it on the message.',
			},
			{
				displayName: 'Department Name or ID',
				name: 'department_id',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getDepartments' },
				default: '',
				description:
					'The department the conversation goes to. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Header Filename',
				name: 'headerFilename',
				type: 'string',
				default: '',
				placeholder: 'e.g. invoice-1042.pdf',
				description: 'The name the recipient sees on a document header',
			},
			{
				displayName: 'Header Type',
				name: 'headerType',
				type: 'options',
				options: [
					{ name: 'Document', value: 'document' },
					{ name: 'Image', value: 'image' },
					{ name: 'Video', value: 'video' },
				],
				default: 'document',
				description: 'Must match the media header of the template',
			},
			{
				displayName: 'Header URL',
				name: 'headerUrl',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://files.example.com/invoice-1042.pdf',
				description:
					'A public https address of the header file. Required when the template has a media header.',
			},
			{
				...namedValues(
					'Header Variables',
					'headerVariables',
					'The variable of a text header that has one',
				),
			},
			{
				displayName: 'New Contact Lead Batch',
				name: 'contactLeadBatch',
				type: 'string',
				default: '',
				description: 'Used only when no contact has the phone and one is created',
			},
			{
				displayName: 'New Contact Name',
				name: 'contactName',
				type: 'string',
				default: '',
				description: 'Used only when no contact has the phone and one is created',
			},
			{
				displayName: 'New Contact Source Name or ID',
				name: 'contactSource',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getLeadSources' },
				default: '',
				description:
					'Where the lead came from. Required when no contact has the phone and one is created. A new name, given by expression, creates a new source. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	},
	...sendOptions(['sendTemplate']),

	/* text */
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		displayOptions: show(['sendText']),
	},
	...sendOptions(['sendText']),

	/* media */
	{
		displayName: 'Media Type',
		name: 'mediaType',
		type: 'options',
		options: [
			{ name: 'Audio', value: 'audio' },
			{ name: 'Document', value: 'document' },
			{ name: 'Image', value: 'image' },
			{ name: 'Video', value: 'video' },
		],
		default: 'image',
		displayOptions: show(['sendMedia']),
	},
	{
		displayName: 'File URL',
		name: 'mediaUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://files.example.com/photo.jpg',
		description: 'A public https address. Fazz fetches it after answering.',
		displayOptions: show(['sendMedia']),
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['sendMedia']),
		options: [
			{
				displayName: 'Caption',
				name: 'caption',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Filename',
				name: 'filename',
				type: 'string',
				default: '',
				placeholder: 'e.g. invoice-1042.pdf',
				description: 'The name the recipient sees on a document',
			},
		],
	},
	...sendOptions(['sendMedia']),
];

import type { INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import type { ParamValue } from '../nodes/Fazz/actions';
import { buildCall } from '../nodes/Fazz/actions';
import { idempotencyKey } from '../nodes/Fazz/shared/helpers';

const node: INode = {
	id: 'node-1',
	name: 'Fazz',
	type: '@fazz-ia/n8n-nodes-fazz.fazz',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

const context = { node, itemIndex: 0, defaultIdempotencyKey: 'n8n:exec-7:node-1:0:0' };

function call(resource: string, operation: string, params: Record<string, ParamValue>) {
	return buildCall(resource, operation, (name, fallback) => params[name] ?? fallback, context);
}

describe('message', () => {
	it('sends a template to a phone with ordered variables and the default idempotency key', () => {
		expect(
			call('message', 'sendTemplate', {
				sendTo: 'phone',
				to: '+55 (11) 98765-4321',
				whatsappNumberId: 3,
				templateId: { __rl: true, mode: 'list', value: '42' },
				variables: { variable: [{ value: 'Maria' }, { value: 'R$ 120,00' }] },
				additionalFields: {},
				options: {},
			}),
		).toEqual({
			method: 'POST',
			path: '/messages/template',
			body: {
				to: '+5511987654321',
				whatsapp_number_id: 3,
				template_id: 42,
				variables: ['Maria', 'R$ 120,00'],
				idempotency_key: 'n8n:exec-7:node-1:0:0',
			},
		});
	});

	it('sends named variables as an object, with header, buttons, routing and the new contact', () => {
		const result = call('message', 'sendTemplate', {
			sendTo: 'contact',
			contactId: { __rl: true, mode: 'id', value: '77' },
			whatsappNumberId: 3,
			templateId: '42',
			variables: { variable: [{ name: 'customer', value: 'Maria' }] },
			additionalFields: {
				headerType: 'document',
				headerUrl: ' https://files.example.com/invoice.pdf ',
				headerFilename: 'invoice.pdf',
				buttons: { button: [{ index: 0, value: 'ABC123' }, { index: 1, value: '' }] },
				department_id: 5,
				assign_to_user_id: '',
				contactSource: 'Website',
				companyTaxId: '12.345.678/0001-90',
				companyName: 'Acme',
			},
			options: { idempotencyKey: 'invoice-1042', sendAnyway: true },
		});

		expect(result.body).toEqual({
			contact_id: 77,
			whatsapp_number_id: 3,
			template_id: 42,
			variables: { customer: 'Maria' },
			header: { type: 'document', url: 'https://files.example.com/invoice.pdf', filename: 'invoice.pdf' },
			buttons: [{ index: 0, value: 'ABC123' }],
			department_id: 5,
			contact: { source: 'Website' },
			company: { tax_id: '12.345.678/0001-90', name: 'Acme' },
			idempotency_key: 'invoice-1042',
			send_anyway: true,
		});
	});

	it('refuses variables with names on some and not others', () => {
		expect(() =>
			call('message', 'sendTemplate', {
				sendTo: 'phone',
				to: '+5511987654321',
				templateId: '42',
				variables: { variable: [{ name: 'customer', value: 'Maria' }, { value: 'x' }] },
			}),
		).toThrow(NodeOperationError);
	});

	it('refuses a template that was not chosen', () => {
		expect(() =>
			call('message', 'sendTemplate', {
				sendTo: 'phone',
				to: '+5511987654321',
				templateId: { __rl: true, mode: 'list', value: '' },
			}),
		).toThrow('Choose the template');
	});

	it('sends text to a conversation without a number', () => {
		expect(
			call('message', 'sendText', { sendTo: 'conversation', conversationId: 901, whatsappNumberId: 3, text: 'Hi' }).body,
		).toEqual({ conversation_id: 901, text: 'Hi', idempotency_key: 'n8n:exec-7:node-1:0:0' });
	});

	it('sends media by URL to a phone', () => {
		expect(
			call('message', 'sendMedia', {
				sendTo: 'phone',
				to: '+5511987654321',
				whatsappNumberId: 3,
				mediaType: 'document',
				mediaUrl: 'https://files.example.com/a.pdf',
				additionalFields: { filename: 'a.pdf', caption: '' },
			}),
		).toEqual({
			method: 'POST',
			path: '/messages/media',
			body: {
				to: '+5511987654321',
				whatsapp_number_id: 3,
				type: 'document',
				url: 'https://files.example.com/a.pdf',
				filename: 'a.pdf',
				idempotency_key: 'n8n:exec-7:node-1:0:0',
			},
		});
	});
});

describe('contact', () => {
	it('creates with the required fields and leaves untouched ones out', () => {
		expect(
			call('contact', 'create', {
				name: 'Maria',
				phone: '+55 11 98765-4321',
				source: 'Website',
				additionalFields: { email: '', lead_batch: 'October' },
			}),
		).toEqual({
			method: 'POST',
			path: '/contacts',
			body: { name: 'Maria', phone: '+5511987654321', source: 'Website', lead_batch: 'October' },
		});
	});

	it('creates or updates by phone', () => {
		expect(call('contact', 'upsert', { phone: '+5511987654321', additionalFields: { name: 'Maria' } })).toEqual({
			method: 'PUT',
			path: '/contacts/by-phone',
			body: { phone: '+5511987654321', name: 'Maria' },
		});
	});

	it('updates filling empty fields unless overwrite is on', () => {
		expect(call('contact', 'update', { contactId: '77', updateFields: { email: 'm@x.com' } }).body).toEqual({
			mode: 'fill_empty',
			email: 'm@x.com',
		});
		expect(
			call('contact', 'update', { contactId: '77', updateFields: { name: 'M', overwrite: true } }),
		).toEqual({ method: 'PATCH', path: '/contacts/77', body: { mode: 'overwrite', name: 'M' } });
	});

	it('adds a note and finds by email', () => {
		expect(call('contact', 'addNote', { contactId: { __rl: true, mode: 'list', value: '77' }, note: 'Paid' })).toEqual({
			method: 'POST',
			path: '/contacts/77/notes',
			body: { body: 'Paid' },
		});
		expect(call('contact', 'find', { findBy: 'email', findEmail: ' m@x.com ' })).toEqual({
			method: 'GET',
			path: '/contacts/search',
			qs: { email: 'm@x.com' },
		});
	});
});

describe('idempotencyKey', () => {
	it('changes with the run, so a node inside a loop sends each round', () => {
		expect(idempotencyKey('7', 'node-1', 0, 2)).not.toBe(idempotencyKey('7', 'node-1', 1, 2));
		expect(idempotencyKey('7', 'node-1', 0, 2)).toBe(idempotencyKey('7', 'node-1', 0, 2));
	});
});

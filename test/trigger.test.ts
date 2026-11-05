import { createHmac } from 'crypto';
import type { IHttpRequestOptions } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { beforeEach, describe, expect, it } from 'vitest';
import { FazzTrigger, webhookName } from '../nodes/FazzTrigger/FazzTrigger.node';

type Call = { method: string; url: string; body?: unknown };
type Reply = { statusCode: number; body: unknown };

const node = { id: 'n', name: 'Fazz Trigger', type: 'x', typeVersion: 1, position: [0, 0], parameters: {} };
const n8nUrl = 'https://n8n.example.com/webhook/abc/webhook';

function hookContext(staticData: Record<string, unknown>, replies: Reply[], calls: Call[], events = ['message.received']) {
	return {
		getNode: () => node,
		getNodeParameter: (name: string) => (name === 'events' ? events : undefined),
		getNodeWebhookUrl: () => n8nUrl,
		getWorkflowStaticData: () => staticData,
		getWorkflow: () => ({ id: '1', name: 'Invoices', active: true }),
		getCredentials: async () => ({ apiKey: 'fz_live_x', baseUrl: 'https://app.fazz.ia.br' }),
		helpers: {
			httpRequestWithAuthentication: async (_credential: string, options: IHttpRequestOptions) => {
				calls.push({ method: String(options.method), url: options.url, body: options.body });
				return replies.shift() ?? { statusCode: 500, body: {} };
			},
		},
	};
}

const methods = new FazzTrigger().webhookMethods.default;

describe('managed webhook', () => {
	let calls: Call[];

	beforeEach(() => {
		calls = [];
	});

	it('creates the webhook in Fazz and keeps its id and secret', async () => {
		const state: Record<string, unknown> = {};
		const context = hookContext(state, [{ statusCode: 201, body: { id: 9, url: n8nUrl, events: ['message.received'], status: 'active', secret: 'whsec_1' } }], calls);

		expect(await methods.create.call(context as never)).toBe(true);
		expect(calls).toEqual([
			{
				method: 'POST',
				url: 'https://app.fazz.ia.br/api/v1/webhooks',
				body: { name: 'n8n · Invoices', url: n8nUrl, events: ['message.received'] },
			},
		]);
		expect(state).toMatchObject({ webhookId: 9, webhookSecret: 'whsec_1' });
	});

	it('explains the public address rule when Fazz refuses the URL', async () => {
		const context = hookContext(
			{},
			[{ statusCode: 422, body: { error: { code: 'validation_failed', message: 'Invalid.', errors: { url: ['The host localhost points to a private network.'] } } } }],
			calls,
		);

		const failure = await methods.create.call(context as never).catch((error: unknown) => error);

		expect(failure).toBeInstanceOf(NodeApiError);
		expect((failure as NodeApiError).description).toContain("set n8n's WEBHOOK_URL");
	});

	it('finds the existing webhook when URL and events still match', async () => {
		const state = { webhookId: 9, webhookSecret: 'whsec_1' };
		const context = hookContext(state, [{ statusCode: 200, body: [{ id: 9, url: n8nUrl, events: ['message.received'], status: 'active' }] }], calls);

		expect(await methods.checkExists.call(context as never)).toBe(true);
	});

	it('replaces a webhook whose events changed', async () => {
		const state: Record<string, unknown> = { webhookId: 9, webhookSecret: 'whsec_1' };
		const context = hookContext(
			state,
			[
				{ statusCode: 200, body: [{ id: 9, url: n8nUrl, events: ['message.received'], status: 'active' }] },
				{ statusCode: 204, body: '' },
			],
			calls,
			['message.received', 'deal.won'],
		);

		expect(await methods.checkExists.call(context as never)).toBe(false);
		expect(calls[1]).toMatchObject({ method: 'DELETE', url: 'https://app.fazz.ia.br/api/v1/webhooks/9' });
		expect(state).toEqual({});
	});

	it('deletes on deactivation, and treats a webhook already gone as deleted', async () => {
		const state: Record<string, unknown> = { webhookId: 9, webhookSecret: 'whsec_1' };

		expect(await methods.delete.call(hookContext(state, [{ statusCode: 404, body: { error: { code: 'not_found', message: 'Not found.' } } }], calls) as never)).toBe(true);
		expect(state).toEqual({});
	});

	it('keeps the state when Fazz could not delete, so it is tried again', async () => {
		const state: Record<string, unknown> = { webhookId: 9, webhookSecret: 'whsec_1' };

		expect(await methods.delete.call(hookContext(state, [{ statusCode: 500, body: {} }], calls) as never)).toBe(false);
		expect(state).toMatchObject({ webhookId: 9 });
	});

	it('names the webhook after the workflow, within 60 characters', () => {
		expect(webhookName('A'.repeat(80))).toHaveLength(60);
		expect(webhookName('')).toBe('n8n · workflow');
	});
});

describe('receiving an event', () => {
	const secret = 'whsec_1';

	function delivery(body: Record<string, unknown>, sign = secret, events = ['message.received']) {
		const raw = JSON.stringify(body);
		const t = Math.floor(Date.now() / 1000);
		const v1 = createHmac('sha256', sign).update(`${t}.${raw}`).digest('hex');
		let status = 200;
		let sent: unknown;

		const context = {
			getWorkflowStaticData: () => ({ webhookId: 9, webhookSecret: secret }),
			getRequestObject: () => ({ rawBody: Buffer.from(raw) }),
			getHeaderData: () => ({ 'x-fazz-signature': `t=${t},v1=${v1}` }),
			getBodyData: () => body,
			getNodeParameter: () => events,
			getResponseObject: () => ({
				status(code: number) {
					status = code;
					return this;
				},
				json(payload: unknown) {
					sent = payload;
					return this;
				},
			}),
			helpers: { returnJsonArray: (data: unknown) => [{ json: data }] },
		};

		return { context, result: () => ({ status, sent }) };
	}

	const trigger = new FazzTrigger();

	it('starts the workflow with the signed envelope', async () => {
		const body = { id: 'evt_1', event: 'message.received', data: { text: 'Oi' } };
		const { context } = delivery(body);

		expect(await trigger.webhook.call(context as never)).toEqual({ workflowData: [[{ json: body }]] });
	});

	it('answers 401 and does not start the workflow when the signature does not match', async () => {
		const { context, result } = delivery({ id: 'evt_1', event: 'message.received' }, 'whsec_wrong');

		expect(await trigger.webhook.call(context as never)).toEqual({ noWebhookResponse: true });
		expect(result().status).toBe(401);
	});

	it('acknowledges the test event and events not chosen, without starting the workflow', async () => {
		for (const event of ['webhook.test', 'deal.won']) {
			const { context } = delivery({ id: 'evt_2', event });

			expect(await trigger.webhook.call(context as never)).toEqual({ webhookResponse: { received: true } });
		}
	});
});

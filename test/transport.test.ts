import type { INode } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { apiRoot, fazzApiError } from '../nodes/Fazz/shared/transport';

const node = { id: 'n', name: 'Fazz', type: 'x', typeVersion: 1, position: [0, 0], parameters: {} } as INode;

describe('apiRoot', () => {
	it.each([
		['https://app.fazz.ia.br', 'https://app.fazz.ia.br/api/v1'],
		['https://app.fazz.ia.br/', 'https://app.fazz.ia.br/api/v1'],
		[' https://crm.example.com/api/v1/ ', 'https://crm.example.com/api/v1'],
	])('%s', (baseUrl, expected) => {
		expect(apiRoot(baseUrl)).toBe(expected);
	});
});

describe('fazzApiError', () => {
	it('keeps the stable code, the API message and how to solve it', () => {
		const error = fazzApiError(
			node,
			422,
			{ error: { code: 'window_closed', message: 'The 24-hour window is closed.', closed_at: null } },
			3,
		);

		expect(error.message).toBe('The 24-hour window is closed. [window_closed]');
		expect(error.description).toContain('Send an approved template instead');
		expect(error.httpCode).toBe('422');
		expect(error.context.itemIndex).toBe(3);
		expect((error.errorResponse as { code: string }).code).toBe('window_closed');
	});

	it('lists the fields of a validation refusal', () => {
		const error = fazzApiError(node, 422, {
			error: {
				code: 'validation_failed',
				message: 'The given data was invalid.',
				errors: { to: ['The to field format is invalid.'] },
			},
		});

		expect(error.description).toContain('to: The to field format is invalid.');
	});

	it('says when to retry and who shares a phone', () => {
		expect(
			fazzApiError(node, 429, { error: { code: 'limit_reached', message: 'Limit.', retry_after: 30 } }).description,
		).toContain('Retry after 30 seconds.');
		expect(
			fazzApiError(node, 409, {
				error: { code: 'ambiguous_recipient', message: 'Two.', candidates: [{ id: 1, name: 'Ana' }] },
			}).description,
		).toContain('Ana (1)');
	});

	it('survives a body that is not the API shape', () => {
		const error = fazzApiError(node, 502, '<html>Bad gateway</html>');

		expect(error.message).toBe('Fazz answered with HTTP 502 [http_error]');
	});
});

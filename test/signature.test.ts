import { describe, expect, it } from 'vitest';
import { verifyFazzSignature } from '../nodes/Fazz/shared/signature';

// The vector Fazz publishes in its API reference, signed by the same code that signs deliveries.
const secret = 'whsec_exemplo_de_documentacao';
const body = '{"id":"01JBX6Q0X4Y9K8Z2M3N4P5Q6R7","event":"message.status"}';
const header = 't=1793714400,v1=738765270d336003af0b9a186a947b3f5d11d82edff66a48725211305cbd11c4';
const signedAt = 1793714400;

describe('verifyFazzSignature', () => {
	it('accepts the documented vector', () => {
		expect(verifyFazzSignature(secret, header, body, signedAt)).toBe(true);
		expect(verifyFazzSignature(secret, header, Buffer.from(body), signedAt + 300)).toBe(true);
	});

	it('refuses a body changed on the way', () => {
		expect(verifyFazzSignature(secret, header, body.replace('status', 'statuz'), signedAt)).toBe(false);
	});

	it('refuses another secret', () => {
		expect(verifyFazzSignature('whsec_other', header, body, signedAt)).toBe(false);
	});

	it('refuses an old delivery replayed after the tolerance', () => {
		expect(verifyFazzSignature(secret, header, body, signedAt + 301)).toBe(false);
		expect(verifyFazzSignature(secret, header, body, signedAt - 301)).toBe(false);
	});

	it('refuses missing or malformed headers', () => {
		expect(verifyFazzSignature(secret, undefined, body, signedAt)).toBe(false);
		expect(verifyFazzSignature(secret, 't=1793714400', body, signedAt)).toBe(false);
		expect(verifyFazzSignature(secret, 'v1=abc,t=1793714400', body, signedAt)).toBe(false);
		expect(verifyFazzSignature('', header, body, signedAt)).toBe(false);
	});
});

import { createHmac, timingSafeEqual } from 'crypto';

/** How far the sender's clock may be from ours, as Fazz documents it. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Checks `X-Fazz-Signature: t=<unix seconds>,v1=<hex>`, where `v1` is
 * HMAC-SHA256 of `"{t}.{raw body}"` with the webhook secret.
 *
 * The timestamp is part of what is signed, so an old delivery captured on the
 * way cannot be replayed: anything more than the tolerance away from now is
 * refused.
 */
export function verifyFazzSignature(
	secret: string,
	header: string | undefined,
	rawBody: Buffer | string,
	nowSeconds: number = Math.floor(Date.now() / 1000),
	toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS,
): boolean {
	if (!secret || !header) {
		return false;
	}

	const parts: Record<string, string> = {};

	for (const piece of header.split(',')) {
		const separator = piece.indexOf('=');

		if (separator > 0) {
			parts[piece.slice(0, separator).trim()] = piece.slice(separator + 1).trim();
		}
	}

	const timestamp = parts.t ?? '';
	const signature = parts.v1 ?? '';

	if (!/^\d+$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature)) {
		return false;
	}

	if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) {
		return false;
	}

	const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
	const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest();

	return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

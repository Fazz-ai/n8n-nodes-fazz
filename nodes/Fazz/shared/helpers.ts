import type { IDataObject, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export type NamedValue = { name?: string; value?: string };

/**
 * A template's variables as the API takes them: an object keyed by name for a
 * template with named variables, or a list in order for a positional one.
 *
 * The person decides by filling the names or not. Mixing both is refused here,
 * before anything is sent, because the API cannot tell which one was meant.
 */
export function templateVariables(
	node: INode,
	entries: NamedValue[] | undefined,
	itemIndex: number,
): string[] | Record<string, string> | undefined {
	if (entries === undefined || entries.length === 0) {
		return undefined;
	}

	const named = entries.filter((entry) => (entry.name ?? '').trim() !== '');

	if (named.length === 0) {
		return entries.map((entry) => entry.value ?? '');
	}

	if (named.length !== entries.length) {
		throw new NodeOperationError(node, 'Give a name to every variable, or to none of them', {
			itemIndex,
			description:
				"A template with named variables takes every value by its name (listed after the template name). A positional template takes them in order, without names.",
		});
	}

	return Object.fromEntries(entries.map((entry) => [(entry.name ?? '').trim(), entry.value ?? '']));
}

/**
 * The key that makes a retry of the same node, on the same item, return the
 * first answer instead of sending again. It includes the run index so a node
 * inside a loop sends each round.
 */
export function idempotencyKey(
	executionId: string,
	nodeId: string,
	runIndex: number,
	itemIndex: number,
): string {
	return `n8n:${executionId}:${nodeId}:${runIndex}:${itemIndex}`.slice(0, 128);
}

/** Leaves out empty strings, so an untouched optional field is not sent at all. */
export function compact(fields: IDataObject): IDataObject {
	return Object.fromEntries(
		Object.entries(fields).filter(
			([, value]) => value !== '' && value !== undefined && value !== null,
		),
	);
}

/**
 * A phone typed with spaces, dashes, dots or parentheses becomes the E.164 the
 * API wants. The country code is never guessed: without the `+`, it is sent as
 * typed and the API explains what is missing.
 */
export function cleanPhone(phone: string): string {
	const trimmed = phone.trim();

	return trimmed.startsWith('+') ? `+${trimmed.slice(1).replace(/[\s().-]/g, '')}` : trimmed;
}

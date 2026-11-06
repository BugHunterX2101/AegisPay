/**
 * Money is bigint inside the system and a decimal string on the wire (MinorString in @aegis/core). JSON.stringify throws
 * on a bigint, so every reply is serialised through this replacer: bigint -> string. Dates already serialise to ISO.
 */
export const jsonReplacer = (_key: string, value: unknown): unknown => (typeof value === 'bigint' ? value.toString(10) : value);

export const toJson = (value: unknown): string => JSON.stringify(value, jsonReplacer);

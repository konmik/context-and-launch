import * as v from 'valibot';

export type JsonValue = string | number | boolean | null | object;

export const JsonObjectSchema = v.pipe(
	v.record(v.string(), v.unknown()),
	v.check((entries) => !Array.isArray(entries)),
);

export type JsonObject = v.InferOutput<typeof JsonObjectSchema>;

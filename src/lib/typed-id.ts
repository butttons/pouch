import { uuidv7 } from "./uuid";

const ENTITY_FALLBACK = "misc";
const ENTITY_FALLBACK_PREFIX = "msc";

const APP_ENTITY = [
	"collection",
	"content",
	"schema_version",
	"media",
	"audit_log",
	"misc",
] as const;

export type AppEntity = (typeof APP_ENTITY)[number];

const APP_ENTITY_PREFIX_MAP = {
	collection: "col",
	content: "con",
	schema_version: "sch",
	media: "med",
	audit_log: "aud",
	[ENTITY_FALLBACK]: ENTITY_FALLBACK_PREFIX,
} as const satisfies Record<AppEntity, string>;

export const getPrefix = <T extends AppEntity>(entity: T) => {
	const safeEntity = entity ?? ENTITY_FALLBACK;
	const prefix = APP_ENTITY_PREFIX_MAP?.[safeEntity] ?? ENTITY_FALLBACK_PREFIX;
	return prefix;
};

export const typedId = <T extends AppEntity>(entity: T) => {
	const prefix = getPrefix(entity);
	return `${prefix}_${uuidv7()}` as const;
};

export type TypedId<T extends AppEntity = AppEntity> = ReturnType<
	typeof typedId<T>
>;

export const isValidEntity = (type: string): type is AppEntity => {
	// @ts-expect-error this is a type guard
	return APP_ENTITY.includes(type);
};

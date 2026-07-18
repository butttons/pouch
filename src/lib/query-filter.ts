export const FILTER_OPERATORS = [
	"eq",
	"gt",
	"gte",
	"in",
	"lt",
	"lte",
	"ne",
	"nin",
] as const;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export const isFilterOperator = (value: string): value is FilterOperator =>
	FILTER_OPERATORS.includes(value as FilterOperator);

type JsonSchemaProperty = {
	type?: string | string[];
	format?: string;
};

/**
 * Returns the filter operators that are valid for a given JSON Schema property.
 * Ordering operators are only allowed on types where comparison is meaningful.
 */
export const getAllowedOperators = (
	property: JsonSchemaProperty,
): FilterOperator[] => {
	const type = property.type;
	const format = property.format;

	if (type === "number" || type === "integer") {
		return ["eq", "gt", "gte", "in", "lt", "lte", "ne", "nin"];
	}

	if (type === "boolean") {
		return ["eq", "in", "ne", "nin"];
	}

	if (type === "string" && format === "date") {
		return ["eq", "gt", "gte", "in", "lt", "lte", "ne", "nin"];
	}

	if (type === "string") {
		return ["eq", "in", "ne", "nin"];
	}

	return [];
};

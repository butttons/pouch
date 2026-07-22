import { err, ok, Result } from "neverthrow";
import Schema from "typebox/schema";

export type ContentValidationError = {
	field: string;
	constraint: string;
	expected: unknown;
	received: unknown;
};

type TypeBoxValidationError = {
	path: string;
	type: string;
	schema: unknown;
	value: unknown;
};

/**
 * Validates content data against a collection schema.
 */
export const validateContentData = (input: {
	data: Record<string, unknown>;
	schema: Record<string, unknown>;
}): Result<void, { errors: ContentValidationError[] }> => {
	const compileResult = Result.fromThrowable(
		() => Schema.Compile(input.schema),
		() => ({ errors: [] as ContentValidationError[] }),
	)();

	return compileResult.andThen((compiled) => {
		const [isValid, errors] = compiled.Errors(input.data);

		if (isValid) {
			return ok(undefined);
		}

		const typedErrors = errors as unknown as TypeBoxValidationError[];

		return err({
			errors: typedErrors.map((error) => ({
				field: error.path || "(root)",
				constraint: error.type,
				expected: error.schema,
				received: error.value,
			})),
		});
	});
};

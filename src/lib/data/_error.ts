type DataLayerErrorContext = {
	source: string;
	input: unknown;
	code?: string;
	cause?: unknown;
	formatPlain?: boolean;
};

type DataLayerErrorOptions = DataLayerErrorContext;

export class DataLayerError extends Error {
	readonly _tag = "DataLayerError";
	readonly context: DataLayerErrorContext;
	public code: string | undefined;
	constructor(message: string, options: DataLayerErrorOptions) {
		const { source, input, cause, formatPlain } = options;
		const finalMessage = options.cause ? `${message} - ${cause}` : message;
		const errorMessage = `[${options.source}] ${finalMessage}`;

		const doFormatPlain = formatPlain ?? false;

		const mainErrorMessage = doFormatPlain ? message : errorMessage;

		super(mainErrorMessage, { cause });
		this.code = options.code;
		this.context = { source, input, cause, code: options.code };
	}

	toJSON() {
		const serialize = (value: unknown): unknown => {
			if (value instanceof DataLayerError) {
				return value.toJSON();
			}

			if (value instanceof Error) {
				return {
					name: value.name,
					message: value.message,
					context: this.context,
					code: this.code,
					...(value.cause !== undefined
						? { cause: serialize(value.cause) }
						: {}),
				};
			}

			return value;
		};
		const context = {
			...this.context,
			...(this.context.cause !== undefined
				? { cause: serialize(this.context.cause) }
				: {}),
		};
		return {
			name: "DataLayerError",
			code: this.code,
			message: this.message,
			context,
			...(this.cause !== undefined ? { cause: serialize(this.cause) } : {}),
		};
	}
}

export const isDataLayerError = (error: unknown): error is DataLayerError => {
	return error instanceof DataLayerError;
};

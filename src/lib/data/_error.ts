type DataLayerErrorContext = {
	source: string;
	input: unknown;
	code?: string;
	cause?: unknown;
};

type DataLayerErrorOptions = DataLayerErrorContext;

export class DataLayerError extends Error {
	readonly _tag = "DataLayerError";
	readonly context: DataLayerErrorContext;
	public code: string | undefined;

	constructor(message: string, options: DataLayerErrorOptions) {
		const { source, cause } = options;
		const finalMessage = cause ? `${message} - ${cause}` : message;

		super(`[${source}] ${finalMessage}`, { cause });
		this.code = options.code;
		this.context = {
			source,
			input: options.input,
			cause,
			code: options.code,
		};
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

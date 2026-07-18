export const normalizeResolveParam = (
	resolve: string | string[] | undefined,
): string | undefined =>
	typeof resolve === "string" ? resolve : resolve?.[0];

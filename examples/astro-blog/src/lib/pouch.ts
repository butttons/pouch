import createClient from "openapi-fetch";
import type { paths } from "../generated/pouch";

export const pouch = createClient<paths>({
	baseUrl: import.meta.env.POUCH_URL,
	headers: { Authorization: `Bearer ${import.meta.env.POUCH_TOKEN}` },
});

import { describe, expect, it } from "vitest";

import { typedId } from "@/lib/typed-id";

import { adminToken, fetchWorker, readerToken } from "../utils";

const uniqueClientId = () => `test-${crypto.randomUUID().slice(0, 8)}`;

const registerClient = async (
	token: string,
	input: {
		clientId?: string;
		name?: string;
		redirectUris?: string[];
		maxScopes?: string[];
	} = {},
) =>
	fetchWorker(
		"/oauth/clients",
		{
			method: "POST",
			body: JSON.stringify({
				clientId: input.clientId ?? uniqueClientId(),
				name: input.name ?? "Test Client",
				redirectUris: input.redirectUris ?? ["https://client.example/callback"],
				maxScopes: input.maxScopes ?? ["content:read", "content:write"],
			}),
		},
		token,
	);

describe("oauth clients", () => {
	describe("POST /oauth/clients", () => {
		it("creates a client with a caller-supplied ID", async () => {
			const token = await adminToken();
			const clientId = uniqueClientId();

			const response = await registerClient(token, { clientId });

			expect(response.status).toBe(201);
			const body = (await response.json()) as Record<string, unknown>;
			expect(body).toMatchObject({
				clientId,
				name: "Test Client",
				redirectUris: ["https://client.example/callback"],
				maxScopes: ["content:read", "content:write"],
			});
		});

		it("falls back to a generated ocl_ ID", async () => {
			const token = await adminToken();

			const response = await fetchWorker(
				"/oauth/clients",
				{
					method: "POST",
					body: JSON.stringify({
						name: "No ID Client",
						redirectUris: ["https://client.example/callback"],
						maxScopes: ["content:read"],
					}),
				},
				token,
			);

			expect(response.status).toBe(201);
			const body = (await response.json()) as { clientId: string };
			expect(body.clientId).toMatch(/^ocl_/);
		});

		it("rejects duplicate client IDs with 409", async () => {
			const token = await adminToken();
			const clientId = uniqueClientId();

			await registerClient(token, { clientId });
			const duplicate = await registerClient(token, { clientId });

			expect(duplicate.status).toBe(409);
		});

		it("requires schema:admin scope", async () => {
			const reader = await readerToken();

			const response = await registerClient(reader);

			expect(response.status).toBe(403);
		});
	});

	describe("GET /oauth/clients", () => {
		it("lists registered clients", async () => {
			const token = await adminToken();
			const clientId = uniqueClientId();
			await registerClient(token, { clientId });

			const response = await fetchWorker("/oauth/clients", {}, token);

			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				data: Array<{ clientId: string }>;
			};
			const found = body.data.find(
				(client: { clientId: string }) => client.clientId === clientId,
			);
			expect(found).toBeDefined();
		});
	});

	describe("GET /oauth/clients/:id", () => {
		it("returns a single client", async () => {
			const token = await adminToken();
			const clientId = uniqueClientId();
			await registerClient(token, { clientId });

			const response = await fetchWorker(
				`/oauth/clients/${clientId}`,
				{},
				token,
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as { clientId: string };
			expect(body.clientId).toBe(clientId);
		});

		it("returns 404 for unknown clients", async () => {
			const token = await adminToken();

			const response = await fetchWorker("/oauth/clients/nope", {}, token);

			expect(response.status).toBe(404);
		});
	});

	describe("PATCH /oauth/clients/:id", () => {
		it("updates redirect URIs and max scopes", async () => {
			const token = await adminToken();
			const clientId = uniqueClientId();
			await registerClient(token, { clientId });

			const response = await fetchWorker(
				`/oauth/clients/${clientId}`,
				{
					method: "PATCH",
					body: JSON.stringify({
						redirectUris: ["https://client.example/new-callback"],
						maxScopes: ["content:read"],
					}),
				},
				token,
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				redirectUris: string[];
				maxScopes: string[];
			};
			expect(body.redirectUris).toEqual([
				"https://client.example/new-callback",
			]);
			expect(body.maxScopes).toEqual(["content:read"]);
		});

		it("returns 404 for unknown clients", async () => {
			const token = await adminToken();

			const response = await fetchWorker(
				"/oauth/clients/nope",
				{ method: "PATCH", body: JSON.stringify({ name: "Nope" }) },
				token,
			);

			expect(response.status).toBe(404);
		});
	});

	describe("DELETE /oauth/clients/:id", () => {
		it("deletes the client", async () => {
			const token = await adminToken();
			const clientId = uniqueClientId();
			await registerClient(token, { clientId });

			const response = await fetchWorker(
				`/oauth/clients/${clientId}`,
				{ method: "DELETE" },
				token,
			);

			expect(response.status).toBe(204);

			const getAfter = await fetchWorker(
				`/oauth/clients/${clientId}`,
				{},
				token,
			);
			expect(getAfter.status).toBe(404);
		});
	});
});

describe("oauth consent flow", () => {
	const setupConsentFlow = async () => {
		const token = await adminToken();
		const clientId = uniqueClientId();
		await registerClient(token, { clientId });

		const verifier = "test-verifier-test-verifier-test-verifier";
		const authPath =
			`/authorize?response_type=code&client_id=${clientId}` +
			`&redirect_uri=${encodeURIComponent("https://client.example/callback")}` +
			`&code_challenge=${verifier}&code_challenge_method=plain` +
			`&state=teststate&scope=${encodeURIComponent("content:read content:write")}`;
		const authUrl = `http://example.com${authPath}`;

		return { token, clientId, verifier, authPath, authUrl };
	};

	const login = async (authUrl: string, passphrase: string) =>
		fetchWorker("/authorize?login=1", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ passphrase, return_url: authUrl }).toString(),
		});

	it("rejects unknown clients before showing any page", async () => {
		const response = await fetchWorker(
			"/authorize?response_type=code&client_id=unknown&redirect_uri=https://x.example/cb",
		);

		expect(response.status).toBe(400);
	});

	it("shows the login page when unauthenticated", async () => {
		const { authPath } = await setupConsentFlow();

		const response = await fetchWorker(authPath);

		expect(response.status).toBe(401);
		expect(await response.text()).toContain("Operator sign-in");
	});

	it("rejects a wrong passphrase", async () => {
		const { authUrl } = await setupConsentFlow();

		const response = await login(authUrl, "wrong-passphrase");

		expect(response.status).toBe(401);
	});

	it("completes approve: login, consent, code exchange, scoped token", async () => {
		const { clientId, verifier, authPath, authUrl } = await setupConsentFlow();

		const loginResponse = await login(authUrl, "local-dev-passphrase");
		expect(loginResponse.status).toBe(302);
		const cookie =
			(loginResponse.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
		expect(cookie).toContain("mcp_session=");

		const consentPage = await fetchWorker(authPath, {
			headers: { Cookie: cookie },
		});
		expect(consentPage.status).toBe(200);
		const consentHtml = await consentPage.text();
		expect(consentHtml).toContain("Approve access");
		expect(consentHtml).toContain("content:read");

		const form = new URLSearchParams({
			return_url: authUrl,
			action: "approve",
		});
		form.append("scope", "content:read");
		form.append("scope", "content:write");
		const approveResponse = await fetchWorker("/authorize", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Cookie: cookie,
			},
			body: form.toString(),
		});
		expect(approveResponse.status).toBe(302);
		const location = approveResponse.headers.get("location") ?? "";
		expect(location.startsWith("https://client.example/callback")).toBe(true);

		const redirectUrl = new URL(location);
		expect(redirectUrl.searchParams.get("state")).toBe("teststate");
		const code = redirectUrl.searchParams.get("code");
		expect(code).toBeTruthy();

		const tokenResponse = await fetchWorker("/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code: code ?? "",
				client_id: clientId,
				redirect_uri: "https://client.example/callback",
				code_verifier: verifier,
			}).toString(),
		});
		expect(tokenResponse.status).toBe(200);
		const tokenBody = (await tokenResponse.json()) as {
			access_token: string;
			scope: string;
		};
		expect(tokenBody.access_token).toBeTruthy();
		expect(tokenBody.scope).toBe("content:read content:write");
	});

	it("redirects with access_denied on deny", async () => {
		const { authUrl } = await setupConsentFlow();

		const loginResponse = await login(authUrl, "local-dev-passphrase");
		const cookie =
			(loginResponse.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

		const denyResponse = await fetchWorker("/authorize", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Cookie: cookie,
			},
			body: new URLSearchParams({
				return_url: authUrl,
				action: "deny",
			}).toString(),
		});

		expect(denyResponse.status).toBe(302);
		const location = new URL(denyResponse.headers.get("location") ?? "");
		expect(location.searchParams.get("error")).toBe("access_denied");
		expect(location.searchParams.get("state")).toBe("teststate");
	});

	it("enforces the client maxScopes ceiling on grants", async () => {
		const token = await adminToken();
		const clientId = uniqueClientId();
		await registerClient(token, {
			clientId,
			maxScopes: ["content:read"],
		});

		const verifier = "test-verifier-test-verifier-test-verifier";
		const authPath =
			`/authorize?response_type=code&client_id=${clientId}` +
			`&redirect_uri=${encodeURIComponent("https://client.example/callback")}` +
			`&code_challenge=${verifier}&code_challenge_method=plain` +
			`&scope=${encodeURIComponent("content:read schema:admin")}`;
		const authUrl = `http://example.com${authPath}`;

		const loginResponse = await login(authUrl, "local-dev-passphrase");
		const cookie =
			(loginResponse.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

		const consentPage = await fetchWorker(authPath, {
			headers: { Cookie: cookie },
		});
		const consentHtml = await consentPage.text();
		expect(consentHtml).toContain("content:read");
		expect(consentHtml).not.toContain("schema:admin");
	});
});

describe("mcp authentication", () => {
	it("accepts a plain bearer JWT via resolveExternalToken", async () => {
		const token = await readerToken();

		const response = await fetchWorker("/mcp", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: { name: "listCollections", arguments: {} },
			}),
		});

		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toContain("HTTP 200");
	});

	it("rejects unknown tokens", async () => {
		const response = await fetchWorker("/mcp", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
				Authorization: `Bearer ${typedId("key")}`,
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/list",
			}),
		});

		expect(response.status).toBe(401);
	});
});

import { describe, expect, it } from "vitest";

import { typedId } from "@/lib/typed-id";

import { fetchWorker, readerToken } from "../utils";

const registerClient = async (
	input: { clientName?: string; redirectUris?: string[] } = {},
) =>
	fetchWorker("/register", {
		method: "POST",
		body: JSON.stringify({
			client_name: input.clientName ?? "Test Client",
			redirect_uris: input.redirectUris ?? ["https://client.example/callback"],
			token_endpoint_auth_method: "none",
		}),
	});

describe("dynamic client registration", () => {
	it("registers a public client without any credentials", async () => {
		const response = await registerClient({ clientName: "Claude.ai" });

		expect(response.status).toBe(201);
		const body = (await response.json()) as Record<string, unknown>;
		expect(body.client_id).toEqual(expect.any(String));
		expect(body.client_name).toBe("Claude.ai");
		expect(body.redirect_uris).toEqual(["https://client.example/callback"]);
		expect(body.token_endpoint_auth_method).toBe("none");
		expect(body.client_secret).toBeUndefined();
	});

	it("rejects registrations without redirect URIs", async () => {
		const response = await fetchWorker("/register", {
			method: "POST",
			body: JSON.stringify({
				client_name: "No URIs",
				token_endpoint_auth_method: "none",
			}),
		});

		expect(response.status).toBe(400);
	});
});

describe("oauth consent flow", () => {
	const setupConsentFlow = async () => {
		const registerResponse = await registerClient();
		const { client_id: clientId } = (await registerResponse.json()) as {
			client_id: string;
		};

		const verifier = "test-verifier-test-verifier-test-verifier";
		const authPath =
			`/authorize?response_type=code&client_id=${clientId}` +
			`&redirect_uri=${encodeURIComponent("https://client.example/callback")}` +
			`&code_challenge=${verifier}&code_challenge_method=plain` +
			`&state=teststate&scope=${encodeURIComponent("content:read content:write")}`;
		const authUrl = `http://example.com${authPath}`;

		return { clientId, verifier, authPath, authUrl };
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

	it("filters unsupported scopes out of the consent screen", async () => {
		const registerResponse = await registerClient();
		const { client_id: clientId } = (await registerResponse.json()) as {
			client_id: string;
		};

		const verifier = "test-verifier-test-verifier-test-verifier";
		const authPath =
			`/authorize?response_type=code&client_id=${clientId}` +
			`&redirect_uri=${encodeURIComponent("https://client.example/callback")}` +
			`&code_challenge=${verifier}&code_challenge_method=plain` +
			`&scope=${encodeURIComponent("content:read bogus:scope")}`;
		const authUrl = `http://example.com${authPath}`;

		const loginResponse = await login(authUrl, "local-dev-passphrase");
		const cookie =
			(loginResponse.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

		const consentPage = await fetchWorker(authPath, {
			headers: { Cookie: cookie },
		});
		const consentHtml = await consentPage.text();
		expect(consentHtml).toContain("content:read");
		expect(consentHtml).not.toContain("bogus:scope");
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
				params: { name: "list_collections", arguments: {} },
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

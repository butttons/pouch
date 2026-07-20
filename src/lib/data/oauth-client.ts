import type {
	ClientInfo,
	OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { fromPromise } from "neverthrow";

import type { Scope } from "@/middleware/auth";

import { BaseDataLayer } from "./_base";

const CLIENT_KEY_PREFIX = "client:";
const CLIENT_META_KEY_PREFIX = "client-meta:";

/**
 * Sidecar metadata kept per OAuth client. The library's ClientInfo record has
 * no field for a scope ceiling, so ours lives in a parallel KV key.
 */
export type OAuthClientMeta = {
	maxScopes: Scope[];
	createdBy: string;
	createdAt: number;
};

export type OAuthClient = {
	clientId: string;
	name: string;
	redirectUris: string[];
	maxScopes: Scope[];
	registeredAt: number | null;
};

type StoredClientRecord = ClientInfo;

/**
 * Record shape mirrors what @cloudflare/workers-oauth-provider@0.8.2
 * `createClient` writes for a public client (no secret). We write it directly
 * because the library's createClient always generates its own clientId and
 * ignores caller-supplied ones.
 */
const buildClientRecord = (input: {
	clientId: string;
	name: string;
	redirectUris: string[];
}): StoredClientRecord => ({
	clientId: input.clientId,
	redirectUris: input.redirectUris,
	clientName: input.name,
	grantTypes: ["authorization_code", "refresh_token"],
	responseTypes: ["code"],
	registrationDate: Math.floor(Date.now() / 1000),
	tokenEndpointAuthMethod: "none",
});

const toOAuthClient = (
	record: ClientInfo | StoredClientRecord,
	meta: OAuthClientMeta | null,
): OAuthClient => ({
	clientId: record.clientId,
	name: record.clientName ?? record.clientId,
	redirectUris: record.redirectUris,
	maxScopes: meta?.maxScopes ?? [],
	registeredAt: record.registrationDate ?? null,
});

export class OAuthClientDataLayer extends BaseDataLayer {
	constructor(
		private kv: KVNamespace,
		private helpers: OAuthHelpers,
	) {
		super();
		this.entity = "oauth_client";
	}

	create(input: {
		clientId: string;
		name: string;
		redirectUris: string[];
		maxScopes: Scope[];
		actor: string;
	}) {
		const record = buildClientRecord({
			clientId: input.clientId,
			name: input.name,
			redirectUris: input.redirectUris,
		});
		const meta: OAuthClientMeta = {
			maxScopes: input.maxScopes,
			createdBy: input.actor,
			createdAt: Date.now(),
		};

		return fromPromise(
			Promise.all([
				this.kv.put(
					`${CLIENT_KEY_PREFIX}${input.clientId}`,
					JSON.stringify(record),
				),
				this.kv.put(
					`${CLIENT_META_KEY_PREFIX}${input.clientId}`,
					JSON.stringify(meta),
				),
			]).then(() => toOAuthClient(record, meta)),
			this.passThroughError({
				message: "Failed to create OAuth client",
				code: "CREATE_FAILED",
				source: "DL.oauthClient.create",
				input,
			}),
		);
	}

	getById(input: { clientId: string }) {
		return fromPromise(
			Promise.all([
				this.helpers.lookupClient(input.clientId),
				this.kv.get<OAuthClientMeta>(
					`${CLIENT_META_KEY_PREFIX}${input.clientId}`,
					"json",
				),
			]).then(([record, meta]) =>
				record ? toOAuthClient(record, meta) : null,
			),
			this.passThroughError({
				message: "Failed to get OAuth client",
				code: "GET_FAILED",
				source: "DL.oauthClient.getById",
				input,
			}),
		);
	}

	list(input: { limit: number; cursor?: string }) {
		return fromPromise(
			this.helpers
				.listClients({ limit: input.limit, cursor: input.cursor })
				.then(async (result) => {
					const items = await Promise.all(
						result.items.map(async (record) => {
							const meta = await this.kv.get<OAuthClientMeta>(
								`${CLIENT_META_KEY_PREFIX}${record.clientId}`,
								"json",
							);
							return toOAuthClient(record, meta);
						}),
					);
					return { items, nextCursor: result.cursor ?? null };
				}),
			this.passThroughError({
				message: "Failed to list OAuth clients",
				code: "GET_FAILED",
				source: "DL.oauthClient.list",
				input,
			}),
		);
	}

	update(input: {
		clientId: string;
		name?: string;
		redirectUris?: string[];
		maxScopes?: Scope[];
	}) {
		return fromPromise(
			(async () => {
				const existing = await this.helpers.lookupClient(input.clientId);
				if (!existing) return null;

				const updated: StoredClientRecord = {
					...existing,
					redirectUris: input.redirectUris ?? existing.redirectUris,
					clientName: input.name ?? existing.clientName,
					// Never let this record become confidential or expire.
					tokenEndpointAuthMethod: "none",
				};

				const existingMeta = await this.kv.get<OAuthClientMeta>(
					`${CLIENT_META_KEY_PREFIX}${input.clientId}`,
					"json",
				);
				const meta: OAuthClientMeta = {
					maxScopes: input.maxScopes ?? existingMeta?.maxScopes ?? [],
					createdBy: existingMeta?.createdBy ?? "unknown",
					createdAt: existingMeta?.createdAt ?? Date.now(),
				};

				await Promise.all([
					this.kv.put(
						`${CLIENT_KEY_PREFIX}${input.clientId}`,
						JSON.stringify(updated),
					),
					this.kv.put(
						`${CLIENT_META_KEY_PREFIX}${input.clientId}`,
						JSON.stringify(meta),
					),
				]);

				return toOAuthClient(updated, meta);
			})(),
			this.passThroughError({
				message: "Failed to update OAuth client",
				code: "UPDATE_FAILED",
				source: "DL.oauthClient.update",
				input,
			}),
		);
	}

	delete(input: { clientId: string }) {
		return fromPromise(
			this.helpers
				.deleteClient(input.clientId)
				.then(() =>
					this.kv.delete(`${CLIENT_META_KEY_PREFIX}${input.clientId}`),
				),
			this.passThroughError({
				message: "Failed to delete OAuth client",
				code: "DELETE_FAILED",
				source: "DL.oauthClient.delete",
				input,
			}),
		);
	}
}

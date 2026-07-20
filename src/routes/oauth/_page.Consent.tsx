import type { FC } from "hono/jsx";

import { Layout } from "@/components/Layout";

type ConsentPageProps = {
	clientName: string;
	scopes: string[];
	returnUrl: string;
};

export const ConsentPage: FC<ConsentPageProps> = ({
	clientName,
	scopes,
	returnUrl,
}) => (
	<Layout title="Approve access">
		<span class="client-chip">{clientName}</span>
		<h1>Approve access</h1>
		<p class="lede">
			<span class="mono">{clientName}</span> is requesting access to this pouch
			instance. Uncheck any scope you do not want to grant.
		</p>
		<form method="post" action="/authorize">
			<input type="hidden" name="return_url" value={returnUrl} />
			{scopes.length > 0 ? (
				<ul class="scopes">
					{scopes.map((scope) => (
						<li>
							<label class="scope">
								<input type="checkbox" name="scope" value={scope} checked />
								<span class="scope-name">{scope}</span>
							</label>
						</li>
					))}
				</ul>
			) : (
				<p class="lede">No scopes requested.</p>
			)}
			<div class="actions">
				<button type="submit" name="action" value="deny" class="btn btn-ghost">
					Deny
				</button>
				<button
					type="submit"
					name="action"
					value="approve"
					class="btn btn-primary"
				>
					Approve
				</button>
			</div>
		</form>
	</Layout>
);

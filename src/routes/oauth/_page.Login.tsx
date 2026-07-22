import type { FC } from "hono/jsx";

import { Layout } from "@/routes/oauth/Layout";

type LoginPageProps = {
	returnUrl: string;
	clientName?: string;
	hasError?: boolean;
};

export const LoginPage: FC<LoginPageProps> = ({
	returnUrl,
	clientName,
	hasError,
}) => (
	<Layout title="Sign in">
		{clientName && <span class="client-chip">{clientName}</span>}
		<h1>Operator sign-in</h1>
		<p class="lede">
			This application is requesting access to this pouch instance. Enter the
			operator passphrase to review the request.
		</p>
		{hasError && <p class="error">That passphrase didn't match. Try again.</p>}
		<form method="post" action="/authorize?login=1">
			<input type="hidden" name="return_url" value={returnUrl} />
			<div class="field">
				<label for="passphrase">Passphrase</label>
				<input
					id="passphrase"
					type="password"
					name="passphrase"
					placeholder="Operator passphrase"
					required
					autofocus
					autocomplete="current-password"
				/>
			</div>
			<div class="actions">
				<button type="submit" class="btn btn-primary">
					Continue
				</button>
			</div>
		</form>
	</Layout>
);

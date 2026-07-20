import type { FC } from "hono/jsx";

import { Layout } from "@/components/Layout";

type LoginPageProps = {
	returnUrl: string;
	hasError?: boolean;
};

export const LoginPage: FC<LoginPageProps> = ({ returnUrl, hasError }) => (
	<Layout title="Authorize">
		<h1>Operator sign-in</h1>
		<p class="lede">
			Enter the operator passphrase to review this authorization request.
		</p>
		{hasError && <p class="error">Invalid passphrase. Try again.</p>}
		<form method="post" action="/authorize?login=1">
			<input type="hidden" name="return_url" value={returnUrl} />
			<div class="field">
				<label for="passphrase">Passphrase</label>
				<input
					id="passphrase"
					type="password"
					name="passphrase"
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

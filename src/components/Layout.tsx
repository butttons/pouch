import type { Child, FC } from "hono/jsx";

type LayoutProps = {
	title: string;
	description?: string;
	children: Child;
};

/**
 * Standalone HTML layout for the handful of human-facing pages pouch serves
 * (OAuth login + consent). Fully self-contained: all styles are inlined so
 * the worker serves everything in one response, with no static assets.
 */
export const Layout: FC<LayoutProps> = ({ title, description, children }) => (
	<html lang="en">
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<meta name="theme-color" content="#09090b" />
			<title>{`${title} · pouch`}</title>
			{description && <meta name="description" content={description} />}
			<meta name="robots" content="noindex, nofollow" />
			<link
				rel="icon"
				href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%2309090b'/%3E%3Ccircle cx='16' cy='16' r='6' fill='%23fafafa'/%3E%3C/svg%3E"
			/>
			{/* Raw text: hono/jsx would HTML-escape quotes in font names and break the CSS */}
			<style dangerouslySetInnerHTML={{ __html: styles }} />
		</head>
		<body>
			<main class="shell">
				<div class="card">
					<div class="brand">
						<span class="brand-mark">pouch</span>
						<span class="brand-dot" />
					</div>
					{children}
				</div>
				<p class="foot">
					<span class="mono">pouch</span> · headless CMS · OAuth
				</p>
			</main>
		</body>
	</html>
);

const styles = `
:root {
	--bg: #09090b;
	--card: #101013;
	--raise: #18181b;
	--border: #27272a;
	--border-strong: #3f3f46;
	--text: #fafafa;
	--text-dim: #a1a1aa;
	--text-faint: #71717a;
	--danger: #f87171;
	--radius: 16px;
	--radius-sm: 10px;
	--font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
	--font-mono: ui-monospace, "SF Mono", SFMono-Regular, "Cascadia Mono", Menlo, Consolas, monospace;
}

* { box-sizing: border-box; }

html { color-scheme: dark; }

body {
	margin: 0;
	background: var(--bg);
	color: var(--text);
	font-family: var(--font-sans);
	font-size: 15px;
	line-height: 1.5;
	font-synthesis: none;
	text-rendering: optimizeLegibility;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}

::selection { background: rgba(255, 255, 255, 0.2); }

.shell {
	position: relative;
	min-height: 100vh;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 20px;
	padding: 32px 20px;
}

.card {
	width: 100%;
	max-width: 420px;
	background: var(--card);
	border: 1px solid var(--border);
	border-radius: var(--radius);
	padding: 36px;
	box-shadow:
		inset 0 1px 0 rgba(255, 255, 255, 0.04),
		0 16px 48px rgba(0, 0, 0, 0.5);
	animation: rise 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes rise {
	from { opacity: 0; transform: translateY(10px); }
	to { opacity: 1; transform: translateY(0); }
}

.brand {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 28px;
}
.brand-mark {
	font-family: var(--font-mono);
	font-size: 16px;
	font-weight: 700;
	letter-spacing: -0.045em;
	color: var(--text);
}
.brand-dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--text);
	box-shadow: 0 0 10px rgba(255, 255, 255, 0.45);
}

h1 {
	margin: 0 0 8px;
	font-size: 24px;
	font-weight: 700;
	line-height: 1.2;
	letter-spacing: -0.022em;
	background: linear-gradient(180deg, #ffffff 30%, rgba(255, 255, 255, 0.68));
	-webkit-background-clip: text;
	background-clip: text;
	color: transparent;
	-webkit-text-fill-color: transparent;
}

.lede {
	margin: 0 0 24px;
	font-size: 14.5px;
	line-height: 1.6;
	letter-spacing: -0.006em;
	color: var(--text-dim);
}
.lede .mono {
	font-size: 13.5px;
	color: var(--text);
}

.mono { font-family: var(--font-mono); }

.field {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-bottom: 20px;
}
.field label {
	font-size: 13px;
	font-weight: 600;
	letter-spacing: -0.006em;
	color: var(--text-dim);
}
.field input[type="password"],
.field input[type="text"] {
	width: 100%;
	padding: 12px 14px;
	font-size: 15px;
	letter-spacing: -0.006em;
	font-family: var(--font-sans);
	color: var(--text);
	background: var(--bg);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	outline: none;
	transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.field input::placeholder { color: var(--text-faint); }
.field input:focus {
	border-color: var(--border-strong);
	box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.12);
}

.scopes {
	display: flex;
	flex-direction: column;
	gap: 10px;
	margin: 0 0 24px;
	padding: 0;
	list-style: none;
}
.scope {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 14px;
	background: var(--raise);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	cursor: pointer;
	transition: border-color 0.15s ease, background 0.15s ease;
}
.scope:hover {
	border-color: var(--border-strong);
}
.scope input {
	appearance: none;
	width: 18px;
	height: 18px;
	margin: 0;
	flex-shrink: 0;
	border: 1px solid var(--border-strong);
	border-radius: 6px;
	background: transparent;
	cursor: pointer;
	position: relative;
	transition: background 0.15s ease, border-color 0.15s ease;
}
.scope input:checked {
	background: var(--text);
	border-color: var(--text);
}
.scope input:checked::after {
	content: "";
	position: absolute;
	left: 5px;
	top: 2px;
	width: 5px;
	height: 9px;
	border: solid var(--bg);
	border-width: 0 2px 2px 0;
	transform: rotate(45deg);
}
.scope input:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.12);
}
.scope-name {
	font-family: var(--font-mono);
	font-size: 13px;
	font-weight: 500;
	letter-spacing: -0.01em;
	color: var(--text-dim);
}
.scope-sep { color: var(--text-faint); }
.scope-action { color: var(--text); }
.scope-hint {
	margin-left: auto;
	font-size: 12px;
	letter-spacing: -0.006em;
	color: var(--text-faint);
}

.empty {
	margin: 0 0 24px;
	padding: 18px 16px;
	text-align: center;
	background: var(--raise);
	border: 1px dashed var(--border-strong);
	border-radius: var(--radius-sm);
}
.empty-title {
	margin: 0 0 4px;
	font-size: 13.5px;
	font-weight: 600;
	letter-spacing: -0.006em;
	color: var(--text-dim);
}
.empty-sub {
	margin: 0;
	font-size: 12.5px;
	line-height: 1.5;
	color: var(--text-faint);
}

.actions {
	display: flex;
	gap: 10px;
}
.btn {
	flex: 1;
	padding: 12px 18px;
	font-size: 14px;
	font-weight: 600;
	letter-spacing: -0.006em;
	font-family: var(--font-sans);
	border-radius: var(--radius-sm);
	border: 1px solid transparent;
	cursor: pointer;
	transition: transform 0.1s ease, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, color 0.15s ease;
}
.btn:active { transform: translateY(1px); }
.btn:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.18);
}
.btn-primary {
	background: var(--text);
	color: var(--bg);
}
.btn-primary:hover {
	background: rgba(250, 250, 250, 0.85);
}
.btn-ghost {
	background: transparent;
	color: var(--text-dim);
	border-color: var(--border);
}
.btn-ghost:hover {
	color: var(--text);
	border-color: var(--border-strong);
}

.error {
	margin: 0 0 18px;
	padding: 10px 14px;
	font-size: 13px;
	line-height: 1.5;
	letter-spacing: -0.006em;
	color: var(--danger);
	background: rgba(248, 113, 113, 0.08);
	border: 1px solid rgba(248, 113, 113, 0.25);
	border-radius: var(--radius-sm);
}

.foot {
	margin: 0;
	font-size: 12px;
	letter-spacing: -0.006em;
	color: var(--text-faint);
}
.foot .mono { color: var(--text-dim); }

.client-chip {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 16px;
	padding: 5px 11px;
	font-family: var(--font-mono);
	font-size: 12.5px;
	font-weight: 500;
	letter-spacing: -0.01em;
	color: var(--text);
	background: rgba(255, 255, 255, 0.06);
	border: 1px solid var(--border);
	border-radius: 999px;
}

@media (prefers-reduced-motion: reduce) {
	.card { animation: none; }
}
`;

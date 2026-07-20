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
			<title>{`${title} · pouch`}</title>
			{description && <meta name="description" content={description} />}
			<meta name="robots" content="noindex, nofollow" />
			<style>{styles}</style>
		</head>
		<body>
			<main class="shell">
				<div class="aurora aurora-a" />
				<div class="aurora aurora-b" />
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
	--bg: #09090d;
	--bg-raise: #101017;
	--card: rgba(19, 19, 27, 0.72);
	--border: rgba(255, 255, 255, 0.08);
	--border-strong: rgba(255, 255, 255, 0.16);
	--text: #f2f2f5;
	--text-dim: #9a9aa8;
	--text-faint: #5d5d6c;
	--accent: #8b7cff;
	--accent-strong: #a99cff;
	--accent-ink: #0c0a1d;
	--danger: #ff6b6b;
	--radius: 16px;
	--radius-sm: 10px;
	--font: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif;
	--mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
}

* { box-sizing: border-box; }

html, body {
	margin: 0;
	padding: 0;
	background: var(--bg);
	color: var(--text);
	font-family: var(--font);
	-webkit-font-smoothing: antialiased;
}

.shell {
	position: relative;
	min-height: 100vh;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 20px;
	padding: 32px 20px;
	overflow: hidden;
}

.aurora {
	position: absolute;
	width: 560px;
	height: 560px;
	border-radius: 50%;
	filter: blur(120px);
	opacity: 0.5;
	pointer-events: none;
}
.aurora-a {
	top: -220px;
	left: -140px;
	background: radial-gradient(circle, rgba(139, 124, 255, 0.35), transparent 65%);
}
.aurora-b {
	bottom: -260px;
	right: -160px;
	background: radial-gradient(circle, rgba(64, 190, 255, 0.22), transparent 65%);
}

.card {
	position: relative;
	width: 100%;
	max-width: 420px;
	background: var(--card);
	border: 1px solid var(--border);
	border-radius: var(--radius);
	padding: 32px;
	backdrop-filter: blur(18px);
	box-shadow:
		0 0 0 1px rgba(0, 0, 0, 0.2),
		0 24px 64px rgba(0, 0, 0, 0.45);
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
	margin-bottom: 24px;
}
.brand-mark {
	font-family: var(--mono);
	font-size: 15px;
	font-weight: 600;
	letter-spacing: -0.02em;
	color: var(--text);
}
.brand-dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--accent);
	box-shadow: 0 0 12px var(--accent);
}

h1 {
	margin: 0 0 6px;
	font-size: 22px;
	font-weight: 650;
	letter-spacing: -0.02em;
}

.lede {
	margin: 0 0 24px;
	font-size: 14px;
	line-height: 1.55;
	color: var(--text-dim);
}

.mono { font-family: var(--mono); }

.field {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-bottom: 20px;
}
.field label {
	font-size: 12px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: var(--text-faint);
}
.field input[type="password"],
.field input[type="text"] {
	width: 100%;
	padding: 12px 14px;
	font-size: 15px;
	font-family: var(--font);
	color: var(--text);
	background: var(--bg-raise);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	outline: none;
	transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.field input:focus {
	border-color: var(--accent);
	box-shadow: 0 0 0 3px rgba(139, 124, 255, 0.22);
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
	background: var(--bg-raise);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	cursor: pointer;
	transition: border-color 0.15s ease, background 0.15s ease;
}
.scope:hover { border-color: var(--border-strong); }
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
	background: var(--accent);
	border-color: var(--accent);
}
.scope input:checked::after {
	content: "";
	position: absolute;
	left: 5px;
	top: 2px;
	width: 5px;
	height: 9px;
	border: solid var(--accent-ink);
	border-width: 0 2px 2px 0;
	transform: rotate(45deg);
}
.scope input:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px rgba(139, 124, 255, 0.22);
}
.scope-name {
	font-family: var(--mono);
	font-size: 13px;
	color: var(--text);
}
.scope-hint {
	margin-left: auto;
	font-size: 11px;
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
	font-family: var(--font);
	border-radius: var(--radius-sm);
	border: 1px solid transparent;
	cursor: pointer;
	transition: transform 0.1s ease, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.btn:active { transform: translateY(1px); }
.btn-primary {
	background: var(--accent);
	color: var(--accent-ink);
}
.btn-primary:hover {
	background: var(--accent-strong);
	box-shadow: 0 6px 24px rgba(139, 124, 255, 0.35);
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
	color: var(--danger);
	background: rgba(255, 107, 107, 0.08);
	border: 1px solid rgba(255, 107, 107, 0.25);
	border-radius: var(--radius-sm);
}

.foot {
	position: relative;
	margin: 0;
	font-size: 12px;
	color: var(--text-faint);
}
.foot .mono { color: var(--text-dim); }

.client-chip {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 16px;
	padding: 6px 12px;
	font-family: var(--mono);
	font-size: 12px;
	color: var(--accent-strong);
	background: rgba(139, 124, 255, 0.1);
	border: 1px solid rgba(139, 124, 255, 0.3);
	border-radius: 999px;
}
`;

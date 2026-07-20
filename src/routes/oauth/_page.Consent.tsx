import type { FC } from "hono/jsx";

import { Layout } from "@/routes/oauth/Layout";

type ConsentPageProps = {
  clientName: string;
  scopes: string[];
  returnUrl: string;
};

type ScopeParts = {
  namespace: string;
  action: string;
};

const SCOPE_HINTS: Record<string, string> = {
  read: "View only",
  write: "Create & modify",
  admin: "Full control",
};

const splitScope = ({ scope }: { scope: string }): ScopeParts => {
  const [namespace = "", action = ""] = scope.split(":");
  return { namespace, action };
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
      Review the requested permissions below. Uncheck any scope you don't want
      to grant.
    </p>
    <form method="post" action="/authorize">
      <input type="hidden" name="return_url" value={returnUrl} />
      {scopes.length > 0 ? (
        <ul class="scopes">
          {scopes.map((scope) => {
            const { namespace, action } = splitScope({ scope });
            const hint = SCOPE_HINTS[action];
            return (
              <li>
                <label class="scope">
                  <input type="checkbox" name="scope" value={scope} checked />
                  <span class="scope-name">
                    {namespace}
                    {action && (
                      <>
                        <span class="scope-sep">:</span>
                        <span class="scope-action">{action}</span>
                      </>
                    )}
                  </span>
                  {hint && <span class="scope-hint">{hint}</span>}
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <div class="empty">
          <p class="empty-title">No permissions requested</p>
          <p class="empty-sub">
            Approving grants access without any explicit scopes.
          </p>
        </div>
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

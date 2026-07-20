import { DataLayer } from "@/lib/data";
import { createBatcher } from "@/lib/db/batcher";
import { createDB } from "@/lib/db/client";

export const createDeps = ({
	env,
	bookmark,
	actor,
}: {
	env: Env;
	bookmark?: string;
	actor: string;
}) => {
	const session = bookmark
		? {
				type: "replica" as const,
				db: env.DB.withSession(bookmark),
			}
		: {
				type: "main" as const,
				db: env.DB,
			};

	const getNextBookmark = () =>
		session.type === "replica" ? session.db.getBookmark() : null;

	const db = createDB(session.db);
	const batch = createBatcher({ database: session.db, kysely: db });
	const DL = new DataLayer({ db, batch, env });

	return {
		DL,
		env,
		actor,
		bucket: env.MEDIA_BUCKET,
		mediaPublicUrl: env.MEDIA_PUBLIC_URL,
		session,
		getNextBookmark,
	};
};

export type Deps = ReturnType<typeof createDeps>;

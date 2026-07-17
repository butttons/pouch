import { createDB } from "./lib/db/client";
import { createDL } from "./lib/data";

export const createDeps = ({
	env,
	bookmark,
}: {
	env: Env;
	bookmark: string;
}) => {
	const session = env.DB.withSession(bookmark);
	const db = createDB(session);

	return {
		DL: createDL({ db }),
		session,
	};
};

export type Deps = ReturnType<typeof createDeps>;

import { createDB } from "./lib/db/client";
import { createDL } from "./lib/data";

let cachedDB: ReturnType<typeof createDB> | null = null;
let cachedDL: ReturnType<typeof createDL> | null = null;

export const createDeps = ({ env }: { env: Env }) => {
	if (!cachedDB) {
		cachedDB = createDB(env.DB);
	}

	if (!cachedDL) {
		cachedDL = createDL({ db: cachedDB });
	}

	return {
		DL: cachedDL,
	};
};

export type Deps = ReturnType<typeof createDeps>;

import { Kysely, ParseJSONResultsPlugin } from "kysely";
import { D1Dialect } from "kysely-d1";

import type { DB } from "./types";

export const createDB = (db: D1Database) =>
	new Kysely<DB>({
		dialect: new D1Dialect({
			database: db,
		}),
		plugins: [new ParseJSONResultsPlugin()],
	});

export type Database = ReturnType<typeof createDB>;
export type DatabaseSchema = DB;

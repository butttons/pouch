import { Kysely, ParseJSONResultsPlugin } from "kysely";

import type { DB } from "./types";
import { D1Dialect } from "./kysely-d1";

export const createDB = (db: D1DatabaseSession) =>
  new Kysely<DB>({
    dialect: new D1Dialect({
      database: db,
    }),
    plugins: [new ParseJSONResultsPlugin()],
  });

export type Database = ReturnType<typeof createDB>;
export type DatabaseSchema = DB;

import { createDB } from "@/lib/db/client";
import { createDL } from "@/lib/data";

export const createDeps = ({
  env,
  bookmark,
}: {
  env: Env;
  bookmark?: string;
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

  return {
    DL: createDL({ db }),
    session,
    getNextBookmark,
  };
};

export type Deps = ReturnType<typeof createDeps>;

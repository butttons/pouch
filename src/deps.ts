import { createDL } from "@/lib/data";
import { createDB } from "@/lib/db/client";
import { createBatcher } from "@/lib/db/batcher";

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
  const batch = createBatcher({ database: session.db, kysely: db });

  return {
    DL: createDL({ db, batch }),
    bucket: env.MEDIA_BUCKET,
    mediaPublicUrl: env.MEDIA_PUBLIC_URL,
    session,
    getNextBookmark,
  };
};

export type Deps = ReturnType<typeof createDeps>;

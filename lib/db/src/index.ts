import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const url = process.env.DATABASE_URL;

// In dev we allow the server to boot without a DB so you can set up the rest
// of the environment first. Calling any exported query will fail loudly.
function makeProxyDb(): any {
  const handler = () => {
    throw new Error(
      "DATABASE_URL is not set. Add a Postgres URL to your .env and restart.",
    );
  };
  return new Proxy({}, { get: handler, apply: handler });
}

export const pool = url ? new Pool({ connectionString: url }) : (null as unknown as pg.Pool);
export const db = url ? drizzle(pool, { schema }) : (makeProxyDb() as ReturnType<typeof drizzle>);
export const hasDb = !!url;

export * from "./schema";

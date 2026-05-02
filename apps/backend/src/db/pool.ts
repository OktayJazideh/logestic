import { env } from "../config/env";

// For dev: reuse connections via pooling.
// Note: we use require() to avoid hard failure when the `pg` package
// isn't installed yet (this repo scaffold can be run before DB deps).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pg = require("pg") as { Pool: new (opts: unknown) => unknown };

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
});


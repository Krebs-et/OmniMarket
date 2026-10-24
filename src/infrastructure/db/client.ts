import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

let database: ReturnType<typeof drizzle<typeof schema>> | undefined;
let client: ReturnType<typeof postgres> | undefined;

export function getDb() {
  if (database) {
    return database;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to connect to PostgreSQL");
  }

  client = postgres(connectionString, {
    prepare: false,
    max: Number(process.env.DB_POOL_MAX ?? 1),
    idle_timeout: 20,
    connect_timeout: 10,
  });
  database = drizzle(client, { schema });
  return database;
}

export async function closeDb() {
  await client?.end();
}

import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? "postgres://aur:aur@localhost:5432/aur";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  casing: "snake_case",
  verbose: true,
  strict: true,
});

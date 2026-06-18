import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load environment variables from .env file.
dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgresql://grafik_lot_user:ZX40iVGLCZwwUwQAxpRogWs1RvlqH9ZL@dpg-d8p884s8aovs73b41t2g-a.frankfurt-postgres.render.com/grafik_lot?sslmode=require';

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    url: connectionString,
  },
  verbose: true,
});

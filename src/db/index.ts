import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';

const { Pool } = pg;

// Fallback to the user's provided Render string if DATABASE_URL is missing
const connectionString = process.env.DATABASE_URL || 'postgresql://grafik_lot_user:ZX40iVGLCZwwUwQAxpRogWs1RvlqH9ZL@dpg-d8p884s8aovs73b41t2g-a.frankfurt-postgres.render.com/grafik_lot?sslmode=require';

export const createPool = () => {
  return new Pool({
    connectionString,
    connectionTimeoutMillis: 15000,
    ssl: {
      rejectUnauthorized: false
    }
  });
};

// Create a pool instance.
const pool = createPool();

// Prevent unhandled pool-level errors from crashing the application
pool.on('error', (err) => {
  console.error('Unexpected error on idle SQL pool client:', err);
});

// Initialize Drizzle with the pool and schema.
export const db = drizzle(pool, { schema });

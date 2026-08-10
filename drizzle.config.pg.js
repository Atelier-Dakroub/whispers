import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './app/data/schema.pg.js',
  out: './drizzle/pg',
});

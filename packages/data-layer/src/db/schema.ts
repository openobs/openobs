// Canonical Postgres Drizzle table definitions. Runtime DDL still lives in
// repository/postgres/schema.sql; this module is the shared schema entrypoint
// for createDbClient and repository query-builder code.
export * from '../repository/postgres/schema.js';

# Postgres hybrid repositories

This directory holds the Postgres-backed portion of the hybrid persistence
mode. The gateway enables it when `DATABASE_URL` starts with `postgres://` or
`postgresql://`; otherwise it defaults to local SQLite persistence.

## Scope

The instance-config stores (`InstanceConfigRepository`, `DatasourceRepository`,
`NotificationChannelRepository`) have Postgres siblings here alongside the
SQLite implementations. Their tables are applied by `schema-applier.ts` from
`schema.sql`.

Domain repositories such as investigations, incidents, feed, cases, approvals,
and shares are SQLite-only. `DATABASE_URL` does not switch the whole data layer
to Postgres; it only moves the instance-scoped config repositories above.

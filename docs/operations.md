# Operations

## Health

`GET /health` executes `SELECT 1`. A failing response means the process cannot currently query
PostgreSQL and should not receive traffic.

## Migration and seed

Production startup applies committed migrations through the one-shot `migrate` Compose service.
The demonstration seed is never automatic and refuses to run when `NODE_ENV=production`.

```bash
pnpm db:validate
pnpm db:deploy
pnpm db:seed
```

## Troubleshooting

- **`DATABASE_URL is required`** — create `.env` from `.env.example`.
- **PostgreSQL is not ready** — inspect `docker compose logs postgres` and verify port `5432` is
  free.
- **Migration service failed** — run `docker compose logs migrate`; do not manually edit applied
  migration files.
- **Application is unhealthy** — run `docker compose logs app` and query `/health`.
- **Integration tests are skipped** — set `TEST_DATABASE_URL` to a disposable migrated database.
- **Port conflict** — set `APP_PORT` or `POSTGRES_PORT` before running Compose.

## Backup

For local demonstration data:

```bash
docker compose exec -T postgres \
  pg_dump -U incident_app -d incident_sla --format=custom > incident-sla.backup
```

Restore into a fresh local database with `pg_restore`. Test recovery procedures before relying on
them for important data.

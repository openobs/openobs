# Tech-debt cleanup — progress snapshot (2026-04-19)

Multi-wave cleanup driven by audit at [tech-debt-audit-plan.md](./tech-debt-audit-plan.md).

## User decisions (locked in)

- `instance_datasources.org_id` TEXT NULL, null = instance-global; no per-org logic in v1
- Credentials encrypt via existing `SECRET_KEY` / `@agentic-obs/common/crypto`
- **No migration code** — fresh build, no data, no users. `setup-config.json` is deleted outright, not migrated.
- Ship everything AGPL (no OSS/Enterprise split scaffolding yet)

## Commits landed (on `main`, **not pushed**, ~28 commits ahead of origin)

Newest first:

- `156baea` **W4 partial** — T4.1 unified error envelope everywhere (middleware, routes, services, common types); T4.2 web-client parsing only. **T4.2 server-side / T4.3 / T4.4 deferred** — W4 agent ran out of tokens.
- `436ca73` **W3** — frontend dedup (single-source types; 3 latent bugs fixed: corporate-gateway provider fallback, missing authType, invalid hex color)
- `ab94368` **W2** (T2.1–T2.7, one big commit — tasks interleaved) — SQLite migration 019, 3 repos with AES-GCM encryption, `SetupConfigService`, `/api/system/*` namespace, `bootstrapAware()` middleware, `instance_settings.bootstrapped_at` marker. Deleted: `setup-config.json` path, `inMemoryConfig`, `loadConfig`/`saveConfig`, `getSetupConfig`, `POST /api/setup/complete`, `POST /api/setup/datasource`, `POST /api/setup/notifications`, `body.test` flag, legacy in-memory server branch.
- `fe52cb4` audit plan doc + `.gitignore` adds `.openobs/` + `.agentic-obs/`
- `d317380` **T1.4** LDAP RFC 4515 escape
- `2518dd4` **T1.2** remove insecure SECRET_KEY dev fallback
- `e36b639` **T1.1** SSRF coverage (setup LLM/models fetches, webhook delivery, OIDC discovery)
- `f7fa0e6` **T1.3** login rate limiter + HTTP 429 + Retry-After
- `1bb6a6c` pre-W1 setup wizard bug fixes (duplicate datasources, avatar menu popover, SetupGuard redirect)

## Deferred scope (needs a follow-up run)

### W4 leftovers

- **T4.2 server-side silent swallows** still there:
  - `packages/llm-gateway/src/router/smart-router.ts:~124` — LLM JSON parse → `{}` silently
  - `packages/web/src/api/client.ts:36-50` — `authHeaders()` catches localStorage parse, still has bare `// ignore`
  - `packages/data-layer/src/cache/redis.ts:30-31` — JSON.parse fail → `null` silently
  - `packages/adapters/src/prometheus/metrics-adapter.ts:71,80,95` — HTTP fail returns `[]` silently
  - `packages/llm-gateway/src/providers/*` — every `listModels()` returns `[]` on error with no log
- **T4.3 legacy path cleanup** not started:
  - `packages/api-gateway/src/paths.ts` — `LEGACY_NAMES = ['.agentic-obs', '.uname-data']` (lines ~33-34) still there. `legacyHomeConfigPath()` export should be removed too if no consumer remains (W2 deleted the setup.ts caller).
  - `packages/api-gateway/src/persistence.ts` — `legacyStoresPath()`
  - `packages/common/src/rbac/actions.ts:112` — "legacy, kept for back-compat" stale comment
  - `packages/common/src/models/index.ts:14` — stale workspace-model comment
- **T4.4 dead code sweep** not started — needs a re-audit to identify what survived W1+W2+W3 that nothing consumes.

## Pending — W5 (verify)

1. `npx tsc --build` from repo root — currently clean as of `156baea`.
2. **Vitest workspace-wide failure**: multiple agents reported `TypeError: Cannot read properties of undefined (reading 'config')` on every test file, likely `vitest@4.1.4` incompatibility. Diagnose. Probably a package-lock or config regression from the W1–W2 work.
3. **`auth-login.test.ts`**: agents flagged pre-existing failures (rate limiter + audit shape). With the vitest fix in place, confirm whether these are real regressions from T1.3 (`AuthError.rateLimited(retryAfterSeconds)` signature change, new `loginRateLimiter` on `/api/setup/admin`) or pre-existing.
4. Wipe `.openobs/` before smoke test (user approved — "没有数据没有用户").
5. `npm start` — manual smoke through the setup wizard end-to-end. Verify:
   - admin bootstrap sets `instance_settings.bootstrapped_at`
   - LLM provider saves via `PUT /api/system/llm` (unauth pre-bootstrap via `bootstrapAware`)
   - datasource add/edit/delete via `/api/datasources` (no more `POST /api/setup/datasource`)
   - **no `setup-config.json` is ever written** to `.openobs/` (the positive-deletion acceptance test)
   - browser Back doesn't land on setup after configured
6. Write `docs/config-architecture.md` — final target state described (one-source-of-truth SQLite, bootstrap flow, credential encryption, bootstrap-aware middleware model).
7. (Optional) push the ~28 local commits once user approves — first push of this sprint.

## Context handoff notes

- **Sandbox blocks `git commit` from sub-agents.** Every W-wave agent stages its work, writes a commit message, reports. Parent agent commits after typecheck. Established workflow.
- **Commit convention**: `TN.M:` per-task when independent; `WN (partial):` or `WN:` when tasks interleave or are bundled. Footer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **Do NOT push** without explicit user approval.
- When picking up this sprint in a fresh session: read this file first; the "Deferred" section is the precise TODO list.

# SELFTEST-1 — Code Analysis (bundled fixture)

> Fake analysis used by `/qa-selftest` to dry-run the generation pipeline offline. Endpoints are fictional — do not probe them over the network.

## Endpoints in scope

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/widgets` | session cookie | returns `[{ id, name, status }]` |
| POST | `/api/widgets` | session cookie + CSRF header | body `{ name }`; returns `201` with `{ id }`; persists to `widgets` table |

## Data model

- Table `widgets` — columns: `id`, `name`, `status` (`'active'` | `'archived'`).

## Auth & gating

- Both endpoints reject unauthenticated requests with 401/403.
- No role gating — the primary user can perform every flow.

## Error behavior

- POST with missing `name` → 400 with body `{ "error": "name is required" }`.

# SELFTEST-2 — Code Analysis (bundled golden fixture)

> Fake analysis for `/qa-selftest golden`. Endpoints are fictional — never probe them.

## Endpoints in scope

| Method | Path | Auth | Notes |
|---|---|---|---|
| PUT | `/api/widgets/{id}/cancel` | session cookie + CSRF header | returns `200`; sets `widgets.status = 'archived'`; `404` for unknown id |

## Data model

- Table `widgets` — columns: `id`, `name`, `status` (`'active'` | `'archived'`). Pick an `'active'` row in `before()` to cancel.

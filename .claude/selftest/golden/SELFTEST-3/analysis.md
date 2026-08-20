# SELFTEST-3 — Code Analysis (bundled golden fixture)

> Fake analysis for `/qa-selftest golden`. Endpoints are fictional — never probe them.

## Endpoints in scope

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/widgets/{id}/tags` | session cookie | returns `[{ id, label }]` |
| POST | `/api/widgets/{id}/tags` | session + CSRF | body `{ label }`; `201` with `{ id }`; persists to `widget_tags` |
| DELETE | `/api/widgets/{id}/tags/{tagId}` | session + CSRF | `200`; removes the `widget_tags` row |

## Data model

- Table `widget_tags` — columns: `id`, `widget_id`, `label`.

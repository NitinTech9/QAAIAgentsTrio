# SELFTEST-3 — Manual Test Cases (bundled golden fixture)

### Section 1: List tags

- **Type:** API

1. Verify that GET /api/widgets/{id}/tags returns 200 with an array of tags having id and label.

### Section 2: Attach tag

- **Type:** API

2. Verify that POST /api/widgets/{id}/tags with a valid label returns 201 with an id, and the row is persisted in the widget_tags table.

### Section 3: Detach tag

- **Type:** API

3. Verify that DELETE /api/widgets/{id}/tags/{tagId} returns 200 and the widget_tags row is removed.
4. Verify that any tags endpoint without a session returns 401 or 403.

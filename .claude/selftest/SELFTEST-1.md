# SELFTEST-1 — Manual Test Cases (bundled fixture)

> Fake manual cases used by `/qa-selftest`. Format matches `create-manual-test-cases.md` output so the automation gates and routing behave exactly as they would on a real ticket.

### Section 1: List widgets

- **Type:** API

1. Verify that GET /api/widgets returns 200 with a list of widgets, each having id, name, and status.
2. Verify that GET /api/widgets without a session returns 401 or 403.

### Section 2: Create widget

- **Type:** API

3. Verify that POST /api/widgets with a valid name returns 201 with an id, and the widget is persisted in the widgets table.
4. Verify that POST /api/widgets with a missing name returns 400 with the error "name is required".
5. Verify that POST /api/widgets without a session returns 401 or 403.

### Section 3: Widgets page

- **Type:** UI

6. Verify that the widgets page lists existing widgets and a newly created widget appears in the table.

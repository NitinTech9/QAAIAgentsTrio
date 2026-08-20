# SELFTEST-2 — Manual Test Cases (bundled golden fixture)

### Section 1: Cancel widget (regression)

- **Type:** API

1. Verify that PUT /api/widgets/{id}/cancel on an active widget returns 200 and the widget's status becomes 'archived' in the widgets table.
2. Verify that PUT /api/widgets/999999/cancel returns 404.

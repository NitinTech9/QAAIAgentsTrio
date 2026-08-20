# SELFTEST-2 — what a correct spec must contain

Accepted reference: `accepted-spec.cy.js.fixture`.

- MUST: exercises PUT /api/widgets/{id}/cancel :: method:\s*"PUT"[\s\S]*?/cancel
- MUST: asserts the cancel returns 200 :: to\.equal\(200\)
- MUST: proves the status transitioned in the DB (the actual bug) :: queryDb[\s\S]*?status[\s\S]*?archived
- MUST: picks a real active widget from the DB, never a hardcoded id :: select[\s\S]*?status = 'active'
- MUST: covers the unknown-id negative case with a 404 :: 999999[\s\S]*?to\.equal\(404\)
- MUST: truly-unauthenticated rejection (clearCookies before asserting 401/403) :: clearCookies\(\)[\s\S]*?oneOf\(\[401,\s*403\]\)
- MUST: sends the CSRF header on the mutation :: x-csrf-token

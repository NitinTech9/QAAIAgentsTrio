# SELFTEST-1 — what a correct spec must contain

Accepted reference: `../../specs/good-api-spec.cy.js.fixture`. Context fixtures: `../../SELFTEST-1.json`, `../../SELFTEST-1-analysis.md`, `../../SELFTEST-1.md`.

- MUST: exercises GET /api/widgets (list) :: method:\s*"GET"[\s\S]*?/api/widgets
- MUST: asserts the list endpoint returns 200 :: to\.equal\(200\)
- MUST: exercises POST /api/widgets (create) :: method:\s*"POST"[\s\S]*?/api/widgets
- MUST: asserts create returns 201 :: to\.equal\(201\)
- MUST: proves persistence against the widgets table :: queryDb[\s\S]*?widgets
- MUST: covers the missing-name negative case with a 400 :: to\.equal\(400\)
- MUST: asserts the exact validation error text :: name is required
- MUST: truly-unauthenticated rejection (clearCookies before asserting 401/403) :: clearCookies\(\)[\s\S]*?oneOf\(\[401,\s*403\]\)
- MUST: sends the CSRF header on the mutation :: x-csrf-token

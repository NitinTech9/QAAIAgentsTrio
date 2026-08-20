# SELFTEST-3 — what a correct spec must contain

Accepted reference: `accepted-spec.cy.js.fixture`.

- MUST: exercises GET /api/widgets/{id}/tags :: method:\s*"GET"[\s\S]*?/tags
- MUST: asserts the list is an array :: to\.be\.an\("array"\)
- MUST: exercises POST (attach) with a 201 assertion :: method:\s*"POST"[\s\S]*?to\.equal\(201\)
- MUST: proves the attach persisted to widget_tags :: queryDb[\s\S]*?widget_tags
- MUST: exercises DELETE (detach) with a 200 assertion :: method:\s*"DELETE"[\s\S]*?to\.equal\(200\)
- MUST: proves the detach removed the row (count 0) :: rows\.length\)\.to\.equal\(0\)
- MUST: truly-unauthenticated rejection (clearCookies before asserting 401/403) :: clearCookies\(\)[\s\S]*?oneOf\(\[401,\s*403\]\)
- MUST: sends the CSRF header on mutations :: x-csrf-token

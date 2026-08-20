# Protocol: status assertions (canonical — ENFORCED by scripts/gates/, not advisory)

- **Never accept a 5xx in a status assertion.** A 5xx means the app broke; the test must surface
  it, never absorb it. A test that can pass on a 5xx cannot fail, and a test that cannot fail
  tests nothing. Never soften an assertion to force a pass.
- **No ambiguous 2xx/4xx `oneOf`.** `oneOf([200, 404])` passes whether the call succeeds or fails.
  Assert the precise expected code — probe the endpoint if unsure.
- **Escape hatch:** `// status-ambiguous: <reason>` on the offending line, ONLY for genuinely
  state-dependent flows where either code is a correct outcome of the same action. The reason is
  mandatory; "flaky" is not a reason.
- **The fake-unauthenticated trap:** the login command sets the session cookie in the browser
  jar, so an "unauthenticated" request without `cy.clearCookies()` first STILL sends the cookie.
  A truly unauthenticated test calls `cy.clearCookies()` in the same `it()` and then asserts
  401/403.

Enforcement: `scripts/gates/` (`no-5xx`, `no-ambiguous`, `access-control`) — run identically by
`/validate-spec`, the generated pre-commit hook, and CI. Comments cannot satisfy or trip these
gates (comment-stripped scanning); the escape hatch is read from the raw source by design.

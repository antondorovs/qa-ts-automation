# API tests

This folder contains API testing examples using Playwright request context.

Structure:
- auth.api.spec.ts -> authorization tests
- users.api.spec.ts -> users endpoint tests
- users.contract.spec.ts -> contract and negative scenario checks
- request-body.contract.spec.ts -> invalid JSON rejection and data integrity checks
- query-parameters.contract.spec.ts -> filter validation and optional query contracts
- related-identifiers.contract.spec.ts -> numeric relation IDs and rejected-create data integrity
- clients/ -> reusable API clients
- fixtures/ -> Playwright fixtures that start the local API and create request clients
- mock/ -> deterministic TypeScript HTTP server and test data
- live/ -> optional public API diagnostics excluded from normal CI execution
- payloads/ -> request bodies
- schemas/ -> response validation schemas
- utils/ -> helper functions

Core API tests use the local mock server and are safe to run without internet access. Public JSONPlaceholder and Reqres checks run only when `RUN_LIVE_API_TESTS=true`.

POST endpoints return `400` for malformed JSON and JSON values that are not objects,
with a JSON `error` message. Rejected requests leave users, posts, and comments
unchanged, and the server continues accepting requests. Unexpected server errors
still return `500`.

The optional `userId` filter on `GET /posts` and `postId` filter on `GET /comments`
must contain decimal digits representing a positive safe integer. Invalid values
return `400` with a JSON error instead of silently returning an unfiltered list.
Omitting a filter returns the full collection; a valid unmatched ID returns `[]`.

Creating posts and comments also requires positive safe integer `userId` and
`postId` values respectively. Zero, negative, fractional, unsafe, and nonnumeric
values return `400` without adding a record; valid IDs remain filterable by GET.

`assertJsonContentType` checks the `application/json` media type without regard
to case and allows parameters such as `charset=utf-8`. Similar names such as
`application/jsonp` and matches inside parameter values do not pass this check.

`assertNumberField` requires a finite numeric value: `NaN` and positive or
negative infinity fail validation. Pagination and problem-details shape checks
use the same rule for their numeric fields; numeric strings are not coerced.

Required-field assertions check the response object's own properties. Inherited
properties do not satisfy required fields; own values of `0`, `false`, and `""`
remain present, while `null` and `undefined` are treated as missing.

Header normalization preserves names such as `__proto__` as ordinary own keys.
`assertHeader` accepts only headers present in the normalized map, so inherited
names such as `constructor` cannot satisfy a missing-header check.

Main goals:
- API automation practice
- response validation
- auth testing
- schema validation
- negative scenarios
- deterministic CI execution

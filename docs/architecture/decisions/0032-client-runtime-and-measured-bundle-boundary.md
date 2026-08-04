# ADR-0032: Client runtime and measured bundle boundary

Date: 2026-08-04

Status: accepted

## Context

The H5 and WeApp clients consumed runtime values through the CommonJS root of `@myfitness/contracts`. That root exports every Zod schema, so importing three runtime values from the shared package pulled the complete validation and locale runtime into each lazy H5 page and the WeApp vendor bundle. Type-only imports were erased correctly, but the runtime root imports made H5 total output about 5.66 MB, the largest route about 633 KB and `vendors.js` about 427 KB. The builds emitted advisory warnings but had no project-owned limit, so the regression could return unnoticed.

The browser must still reject malformed identity-service responses. Removing all response checks for size would weaken the trust boundary, while making the contracts package browser-specific would couple server authority to one bundler.

## Decision

1. Runtime constants used by the client are exported through dependency-free contract subpaths. Client modules may continue importing types from the root because TypeScript erases them, but browser runtime code must not import the umbrella contract entry.
2. The two public identity response shapes use a small browser guard with exact keys and the same URL, length, scope-count, UUID, provider, boolean and offset-datetime boundaries as the shared schemas. Shared Zod schemas remain authoritative for API/server parsing and contract tests; focused client tests prevent the guard from silently widening.
3. `myfitness-client-quality-budget/v1` is a strict checked-in budget. A dependency-free verifier derives H5 entry assets from `index.html`, measures total and largest asynchronous JavaScript, measures WeApp total, `vendors.js` and largest page JavaScript, rejects symlinked/escaping build trees and scans JavaScript for markers from the removed full validation runtime.
4. The gate runs after both production builds in main CI and before immutable client release assembly. It does not suppress Taro/webpack warnings; the 305 KiB H5 entry remains a registered risk even while it passes the explicit 320 KB project ceiling.

## Consequences

- H5 output is about 1.65 MB with a 189 KB largest async route; WeApp output is about 643 KB with a 19 KB vendor bundle on the accepted build.
- A future runtime root import or material bundle increase fails reproducibly before publication.
- Small identity response guards are duplicated at the browser boundary and must change with the shared contract. Focused parity tests and exact-key rejection make that maintenance explicit.
- The measured budgets are regression ceilings, not performance claims. Deliberate increases require a reviewed budget change with new evidence; the H5 framework entry still needs later splitting or upstream improvement.

## Alternatives rejected

- Keep advisory webpack output only: it did not detect per-route Zod duplication and cannot protect WeApp output.
- Remove client response validation: smaller, but unsafe at an identity boundary.
- Convert all shared contracts to a browser-first ESM package now: a wider, higher-risk packaging migration than the bounded subpath split.
- Set ceilings far above current output: technically green but would not prevent the regression this decision addresses.

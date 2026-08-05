# Iteration 084: Bounded consent-receipt history

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round gives the authenticated owner a bounded consent-receipt chronology without changing authorization state. Acceptance requires a strict owner-scoped stable cursor, default-10/max-20 pages, server-confirmed empty and continuation states, accepted/revoked interval labels that cannot imply current status, no provider/health payload and real-service H5 proof.

The round adds one read endpoint and one covering index, but no consent write, new business table, persistent client history, polling, export duplication, medical interpretation or cloud integration. Current overview and revocation reconciliation remain the only custody mutation authority.

## 2. Structure, technology and design state

- Shared contracts add strict consent-receipt query/item/page schemas and keep `status` out of the historical item.
- `consent-receipt-cursor.ts` owns one opaque version/UUID cursor; the privacy service resolves it under the owner and leaves the time/UUID tuple comparison inside PostgreSQL.
- Migration 0027 adds `consent_events (user_id, accepted_at DESC, id DESC)` for the exact read order.
- `consent-receipt-history.tsx` owns one explicit collapsed/read/page-memory ledger with server-confirmed empty, accepted prefix, continuation and product-owned failure states.
- The existing consent card remains the current summary. Historical items use `ACCEPTED RECEIPT` or `REVOKED INTERVAL`, bounded version/times and repeated current-authority copy.

## 3. Implementation method

### Keep historical and current evidence separate

The endpoint returns receipt ID, purpose, version, `acceptedAt` and nullable `revokedAt` only. The page never receives a derived current status and never uses history to enable revocation. A missing revocation timestamp is labeled as history whose current state must be read above.

### Bind the cursor to the owner

The base64url payload contains only `{ v: 1, id }`. Before reading the suffix, the API resolves the ID under the authenticated user. Missing, malformed and foreign anchors share one 400 boundary and disclose no account identity.

### Preserve database precision

The first integration run exposed that PostgreSQL timestamps retain microseconds while JavaScript `Date` retains milliseconds. Returning an anchor time to JavaScript skipped same-instant older UUID rows. The final query resolves and compares `(accepted_at, id)` wholly inside PostgreSQL, retaining exact precision and stable continuation when a new head is inserted.

### Keep the client bounded and reversible

History opens only after an explicit action, requests ten items, deduplicates by receipt ID and retains items/cursor only in React memory. A refreshed overview remounts the history boundary so older history cannot masquerade as newly accepted authority. No polling, URL state or application storage is added.

## 4. Validation evidence

- Repository-wide unit validation passed 79 files / 404 tests, including strict contract, cursor and migration-order cases; PostgreSQL integration validation passed 19 files / 63 tests, including six privacy ownership cases; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting, API build and administrator build passed.
- PostgreSQL proof covers an authenticated account with zero receipts, six original receipts across 2-item pages, a later new head excluded from the issued suffix, no duplicates, no user ID in the response, and malformed/cross-owner cursors returning 400.
- The complete main browser suite passed 90/90 in 3.2 minutes. After visual review corrected Taro's `disabled="false"` text treatment, the final privacy browser group passed 9/9 and explicitly asserted visible mineral toggle text plus empty, 10-item and 12-item states.
- The correctly sequenced OIDC build/suite passed 3/3, retaining 93 browser tests.
- Normal H5, OIDC H5 and final WeApp production builds passed. Known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,797,774 bytes, entry 319,237 and largest async JavaScript 205,178; WeApp total 1,061,330, vendor 19,338 and largest page 55,697. Forbidden runtime-marker scans are empty. Budgets are narrowly set to 2,801,000/320,000/206,000 and 1,064,000/25,000/56,100 respectively.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Obsidian status and this knowledge archive are written and verified byte-for-byte before commit.
- Inspected evidence: `iteration-084-consent-receipt-history-mobile.png`.

## 5. Problems found and experience captured

- Cursor timestamps should not cross a lower-precision runtime when identical-time rows need a UUID tie-breaker. Resolve mutable database-native boundaries inside the database.
- A cursor that contains only a receipt ID is smaller and avoids identity/time disclosure, but it must be owner-resolved before use; decoding alone is not authorization.
- Historical acceptance without a revocation timestamp is not equivalent to current active consent. Omitting `status` from the contract prevents a misleading shortcut.
- Adding the history list to the overview would make every privacy read heavier and couple optional chronology to mutation authority. Explicit lazy loading keeps the boundary independent.
- Taro renders `disabled={false}` on its custom button element, so generic disabled selectors can still hide enabled text. Event-level pointer/Enter/Space guards plus `aria-disabled` preserve both behavior and visual legibility.
- Server-confirmed empty is materially different from unread history. The component already retains explicit initial/continuation failures for the next authority-focused loop instead of using an empty array default.
- Full browser runs overwrite historical screenshots with fixture dates; tracked artifacts were restored and only the new iteration artifact remains.

## 6. Global state review, remaining risks and next step

Consent receipts are now inspectable without a full export, and their pagination is stable under same-time rows and new head events. The proof establishes owner isolation and local Chromium H5 behavior, not deployed provider/legal policy, real WeChat device accessibility or external audit retention.

The next smallest local gap is consent-history read authority under failure. Iteration 085 should prove that initial failure never becomes empty, continuation failure retains the accepted prefix and cursor, product-owned failure families remain distinct and one focused explicit retry restores the same read without affecting current consent mutation authority. Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

This archive is also the iteration-084 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 083 archive](083-portable-export-client-artifact-validation.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0011](../architecture/decisions/0011-user-owned-export-and-erasure.md)
- [ADR-0059](../architecture/decisions/0059-privacy-custody-read-authority.md)
- [ADR-0077](../architecture/decisions/0077-optional-consent-revocation-response-loss-recovery.md)
- [ADR-0078](../architecture/decisions/0078-portable-export-client-artifact-validation.md)
- [ADR-0079](../architecture/decisions/0079-bounded-consent-receipt-history.md)
- [Privacy ownership model](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [Architecture baseline](../architecture/ARCHITECTURE.md)
- [Design system review](../design/DESIGN_SYSTEM.md)

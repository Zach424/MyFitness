# Iteration 085: Consent-history read authority

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round makes the bounded consent-receipt ledger failure-safe without changing its API or current authorization model. Acceptance requires a failed first read to remain unknown, latest-page and continuation failures to retain accepted evidence, continuation retry to reuse the unchanged cursor, four product-owned failure families, one focused retry and current overview/revocation controls that remain independent.

The round adds one explicit history refresh and one client state contract, but no endpoint, migration, consent mutation, persistent cache, polling, background synchronization, raw transport copy, medical interpretation or external service.

## 2. Structure, technology and design state

- `consent-receipt-history.model.ts` owns seven view phases and the four-family failure presentation without importing a runtime validation library.
- `consent-receipt-history.tsx` retains nullable first-page authority, accepted items and the continuation cursor in React memory and reissues only the failed operation.
- The non-empty footer now exposes `核对最新凭证` separately from `加载更早凭证`; both use the shared pointer/Enter/Space guard rather than Taro's non-native disabled behavior.
- The amber receipt identifies initial unknown or retained evidence, moves H5 focus to one retry and leaves the current consent rows above behaviorally unchanged.

## 3. Implementation method

### Make phase independent of item count

Collapsed, initial-loading, ready, refreshing, continuing, initial-error and retained-stale are derived from whether the panel is open, whether a complete page has ever been accepted, the in-flight operation and failure presence. An empty array is therefore only a successful server fact; the initial error path keeps `items === null` and cannot render the empty component.

### Freeze accepted evidence on failure

Refresh starts from the head but replaces items/cursor only after a complete response. Continuation appends unseen receipt IDs only after success. Either failure sets a presentation receipt without changing items or `nextCursor`; retry dispatches refresh or continuation according to the stored failed operation. The browser captures both continuation URLs and requires exact equality.

### Keep current authorization independent

The history component owns no callback that changes parent read authority. Injected first/refresh/continuation failures leave the current optional-consent `撤回这项授权` action at `aria-disabled="false"`. Parent custody staleness may still disable child reads, but child chronology failure cannot freeze or authorize a parent mutation.

### Test product copy rather than server text

The pure model covers offline, refused, service and unknown headings and retained-cursor detail. Browser fixtures return unique raw backend messages in 403/503 bodies and prove none enters the page. Chromium's three expected failed-resource console lines are counted explicitly while every other console, page and request failure remains prohibited.

## 4. Validation evidence

- Repository-wide unit validation passed 80 files / 407 tests; the new model tests cover all seven phases, first-read unknown and four distinct failure families.
- PostgreSQL integration validation passed 19 files / 63 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting and zero-diff checks passed.
- Targeted real API H5 proof passed both consent-history scenarios: server-confirmed empty/current/10-to-12 continuation and initial/refresh/continuation fault recovery.
- The complete main browser suite passed 91/91 in 3.0 minutes; the correctly sequenced OIDC build/suite passed 3/3, retaining 94 browser tests.
- API, administrator, normal H5, OIDC H5 and WeApp production builds passed. Known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed after a narrow WeApp total rebaseline: H5 total 2,800,306 bytes, entry 319,238 and largest async JavaScript 205,178; WeApp total 1,064,135, vendor 19,338 and largest page 55,697. Forbidden runtime-marker scans are empty. Only the WeApp total ceiling moved from 1,064,000 to 1,067,000 bytes.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Obsidian status and this knowledge archive are written and verified byte-for-byte before commit.
- Inspected evidence: `iteration-085-consent-history-read-authority-mobile.png`.

## 5. Problems found and experience captured

- A failure-safe data list needs an explicit nullable first snapshot; defaulting to `[]` destroys the distinction between service-confirmed empty and unread.
- Refresh and continuation have different retry semantics even when they share failure styling. Store the failed operation and never infer it from the item count.
- Cursor stability should be asserted at the actual request URL, not only by final deduplication; a refreshed cursor could still coincidentally return the same rows.
- Expected injected HTTP failures appear as Chromium resource errors. Tests should count only the exact injected lines and continue rejecting every unrelated browser error instead of disabling error collection.
- A history read is not current consent authority. Child failure must not leak upward into revocation eligibility, just as historical acceptance must not enable a mutation.
- The small dependency-free model increased the WeApp total by 2,805 bytes from the prior measured tree and exceeded the deliberately narrow ceiling by 135 bytes. Rebaseline only the failed total metric; vendor, page, H5 entry and async ceilings remain unchanged.
- Full browser runs regenerate date-bearing historical screenshots. Restore all previously accepted tracked artifacts and retain only the new iteration evidence.

## 6. Global state review, remaining risks and next step

The consent chronology now preserves evidence and recovery semantics across every foreground read operation. This proves local Chromium H5 behavior, not real WeChat focus/file-system semantics, screen-reader narration, deployed provider/legal policy or external audit retention.

The next smallest local gap is an accessibility matrix for the newly expanded history states. Iteration 086 should prove 320 px and large-text wrapping, pointer plus Enter/Space activation, retry focus and visible current-authority controls across initial-error, retained-prefix and footer actions without changing data or consent behavior. Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

This archive is also the iteration-085 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 084 archive](084-bounded-consent-receipt-history.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0011](../architecture/decisions/0011-user-owned-export-and-erasure.md)
- [ADR-0059](../architecture/decisions/0059-privacy-custody-read-authority.md)
- [ADR-0077](../architecture/decisions/0077-optional-consent-revocation-response-loss-recovery.md)
- [ADR-0079](../architecture/decisions/0079-bounded-consent-receipt-history.md)
- [ADR-0080](../architecture/decisions/0080-consent-history-read-authority.md)
- [Privacy ownership model](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [Architecture baseline](../architecture/ARCHITECTURE.md)
- [Design system review](../design/DESIGN_SYSTEM.md)

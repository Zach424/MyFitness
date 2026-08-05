# Iteration 082: Optional-consent revocation response-loss recovery

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round makes optional-consent revocation resilient to a lost POST response. Acceptance requires retention of the exact target purpose only in page memory, a frozen custody desk, one explicit current-overview read before another mutation, success only from explicit revoked evidence, no inferred cleanup counts and a fresh confirmation if current consent remains active.

The round adds no API/schema/database change, persistent consent state, automatic/background replay, polling or offline queue. Managed infrastructure, identity tenants, object custody, telemetry and policy inputs remain parked.

## 2. Structure, technology and design state

- `privacy-revoke-recovery.ts` owns the dependency-free failure taxonomy and exact-purpose current-evidence classifier.
- The privacy page retains only purpose plus one product-owned receipt in React memory and composes it with the existing five-phase overview authority.
- One amber polite receipt sits above the retained ownership ledger. Its guarded action is the only custody action until resolution; back, profile editing and logout remain available.
- The existing `GET /me/privacy` response is the sole reconciliation evidence. No cleanup-result endpoint or new read model is introduced.
- Mobile evidence keeps the unknown-result boundary, retained nine-item inventory and one full-width action in the first viewport.

## 3. Implementation method

### Separate authorization state from cleanup result

Network markers, 408/425/429/5xx responses and unknown adapter errors require reconciliation. Explicit non-retryable refusal terminates the attempt. A reconciled overview can prove current authorization state, but only the original POST response can provide removed-photo/analysis counts.

### Freeze the complete custody desk

After ambiguous failure, export, all optional-consent controls, export skipping, erasure acknowledgement, confirmation input and deletion remain visible but inert. The previous accepted inventory stays labeled in page memory. The target purpose and receipt are not persisted.

### Resolve exact-purpose evidence

One explicit overview GET accepts `revoked` as applied. `active` closes recovery and requires another fresh user confirmation if revocation is still desired. Missing or `never_granted` evidence is divergent because it does not match the append-oriented active-to-revoked transition.

### Avoid replay and overclaiming

Reconciliation never sends POST and no callback queues a retry. Applied copy says current authorization is revoked while explicitly withholding cleanup counts. A failed overview read retains the receipt for another explicit GET.

## 4. Validation evidence

- Repository-wide unit validation passed 77 files / 396 tests, including four revocation failure/evidence cases; PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting, API build and administrator build passed.
- The privacy browser group passed 7/7. Its real-service response-loss scenario committed food-photo revocation before aborting only the response, resolved it with one POST/one GET and no cleanup-count claim, then aborted AI revocation before commit, resolved active state with one GET and produced a later POST only after a fresh explicit confirmation.
- The complete main browser suite passed 88/88 in 2.9 minutes; the correctly sequenced OIDC build/suite passed 3/3, retaining 91 browser tests.
- Normal H5, OIDC H5 and WeApp production builds passed. Standard H5 was restored after OIDC validation; known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,819,656 bytes, entry 319,238 and largest async JavaScript 207,699; WeApp total 1,047,834, vendor 19,338 and largest page 55,697. Forbidden runtime-marker scans are empty. Only total budgets moved, to 2,822,000/1,050,000 bytes.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Obsidian status and this knowledge archive are written and verified byte-for-byte before commit.
- Inspected evidence: `iteration-082-privacy-revocation-recovery-mobile.png`.

## 5. Problems found and experience captured

- Idempotent server behavior does not make a blind destructive replay good evidence handling. Current state must be read before another intent is accepted.
- `revoked` and `never_granted` are both inactive in a broad sense, but only `revoked` proves the expected consent-ledger transition for a previously active row.
- Current authorization and cleanup counts have different evidence sources. Showing zero or a guessed count after response loss would falsely narrow the deletion claim.
- Freezing only the target button is insufficient because export and account erasure would also consume an uncertain custody snapshot.
- The retained overview is useful context but not mutation authority. Back, profile editing and logout can remain active because they do not rely on it.
- Browser-aborted requests generate expected Chromium `ERR_FAILED` console entries; the scenario filters only those exact injected failures while retaining all unrelated browser-error assertions.
- Full browser runs overwrite historical screenshots with fixture dates; tracked artifacts were restored and only the new iteration artifact remains.

## 6. Global state review, remaining risks and next step

The optional-consent lifecycle now joins profile, favorite, aggregate, plan, AI and media paths in treating response loss as unresolved evidence rather than ordinary failure. The proof establishes application-level local H5 behavior, not physical radio loss or WeChat-device behavior. Recovery is deliberately page-memory-only and cannot resume after reload.

The next local custody gap is portable-export artifact validation. A successful transport status currently reaches save/download without first proving the response is the current versioned JSON contract. Iteration 083 should validate the artifact locally across supported client adapters, keep malformed content out of success copy and avoid persisting or logging exported health content. Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

This archive is also the iteration-082 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 081 archive](081-profile-goal-response-loss-recovery.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0011](../architecture/decisions/0011-user-owned-export-and-erasure.md)
- [ADR-0059](../architecture/decisions/0059-privacy-custody-read-authority.md)
- [ADR-0077](../architecture/decisions/0077-optional-consent-revocation-response-loss-recovery.md)
- [Privacy ownership model](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [Architecture baseline](../architecture/ARCHITECTURE.md)
- [Design system review](../design/DESIGN_SYSTEM.md)

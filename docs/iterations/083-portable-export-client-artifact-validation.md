# Iteration 083: Portable-export client artifact validation

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round prevents a successful export transport from becoming download/save success before the client verifies the artifact. Acceptance requires the current JSON media type and v4 envelope/collection topology, a 50 MiB client boundary, verification before H5 download or WeApp persistent save, bounded receipt metadata, rejection that preserves the custody overview and real-service browser proof without logging, uploading or persisting exported health content.

The round adds no API/schema/database change, export cache, background delivery, deep medical interpretation or cloud integration. Real WeApp device file-system proof, managed infrastructure, identity tenants, object custody, telemetry and policy inputs remain parked.

## 2. Structure, technology and design state

- `privacy-export-verification.ts` owns the dependency-free media, envelope, topology, identifier, time and UTF-8 size checks plus product-owned failure classes.
- `privacy-export-download.ts` is dynamically imported only by the privacy export action. It composes Taro download/session behavior with H5 Blob reading/anchor release and WeApp temporary-file reading/persistent save.
- The privacy page receives only `schemaVersion`, `generatedAt` and `byteLength`; account ID, parsed rows and local file content never enter its state or feedback.
- One red polite alert sits above the retained nine-item custody ledger after rejection. Valid feedback names v4, formatted bytes and generation time before the existing download/save result.
- Shared API token/base helpers are exported for the lazy adapter without adding a circular dependency or another session store.

## 3. Implementation method

### Verify before writing

H5 fetches and reads the temporary Blob, while WeApp uses `getFileSystemManager().readFile` with UTF-8. Only after verification does H5 click a generated anchor or WeApp call `saveFile`. Invalid artifacts cannot trigger either operation.

### Keep the receipt bounded

The verifier requires `application/json`, exact outer/data key sets, the v4 literal, offset generation time, UUID account identifier, object/array collection topology and at most 50 MiB of exact UTF-8 content. It returns only version, time and byte count. The full parsed graph is discarded locally and never rendered, logged or stored.

### Contain temporary artifacts

H5 Blob URLs are revoked on 401 retry, non-success transport, read failure, validation rejection and after a successful anchor click. Authentication may refresh once through the existing session behavior; validation errors are terminal and never replay the export automatically.

### Preserve route performance

Putting the whole file adapter behind one dynamic import prevents the verifier and platform branches from being duplicated across existing lazy routes. The final H5 tree is smaller than iteration 082 even though the privacy workflow gained validation.

## 4. Validation evidence

- Repository-wide unit validation passed 78 files / 400 tests, including four export-verification cases; PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting, API build and administrator build passed.
- The privacy browser group passed 8/8. Its real-service scenario rejected an old v3 JSON body and an exact API response forced to `text/plain` without a Playwright download, then accepted the unmodified v4 attachment and emitted one download plus bounded receipt copy.
- The complete main browser suite passed 89/89 in 3.0 minutes. Two earlier complete runs exposed a pre-existing aggregate-history focus timer race; the final page-commit effects prioritize initial-close focus and then failure-retry focus, and targeted food/workout history cases plus the third full run pass.
- The correctly sequenced OIDC build/suite passed 3/3, retaining 92 browser tests. Normal H5 was restored afterward.
- Normal H5, OIDC H5 and WeApp production builds passed. Known non-blocking Taro entry-size/cache warnings remain registered; WeApp validation is compilation evidence only, not a real-device save claim.
- `pnpm client:verify` passed: H5 total 2,787,260 bytes, entry 319,238 and largest async JavaScript 205,001; WeApp total 1,052,864, vendor 19,338 and largest page 55,697. Forbidden runtime-marker scans are empty. Budgets are narrowly set to 2,790,000/320,000/206,000 and 1,055,000/25,000/56,100 respectively.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Obsidian status and this knowledge archive are written and verified byte-for-byte before commit.
- Inspected evidence: `iteration-083-export-verification-mobile.png`.

## 5. Problems found and experience captured

- HTTP 2xx proves transport completion, not that the artifact is the current portable contract. Media type and version/topology must be checked before any user-visible write action.
- Importing validation/download logic through the shared API module duplicated it across route chunks. A privacy-only dynamic adapter both preserves the boundary and reduces total H5 output by about 32 KiB.
- Verification state must exclude account ID and parsed content. The UI needs only enough metadata to explain what was accepted.
- H5 Blob URLs are resources with failure-path custody implications; every early exit needs release, not only the successful anchor path.
- A successful WeApp build proves Taro API compatibility but not sandbox, quota, path or user-visible save behavior on a real device.
- The full-suite focus failures were deterministic evidence of two competing delayed focus callbacks. Moving focus to post-commit effects establishes ordering after the relevant DOM exists and leaves history read/mutation semantics unchanged.
- Full browser runs overwrite historical screenshots with fixture dates; tracked artifacts were restored and only the new iteration artifact remains.

## 6. Global state review, remaining risks and next step

Portable export now has a client-side pre-write evidence boundary in addition to the server snapshot contract. The proof establishes local Chromium H5 behavior and WeApp compilation, not real WeChat device storage behavior, large-account streaming, archive encryption or production custody controls.

The next local transparency gap is bounded owner-visible consent-receipt history. The current overview is correct mutation authority and export v4 contains every event, but the privacy page does not provide a paged historical ledger that clearly separates past acceptance/revocation evidence from current status. Iteration 084 should audit and add that read-only surface without broadening consent mutation authority. Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

This archive is also the iteration-083 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 082 archive](082-optional-consent-revocation-response-loss-recovery.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0011](../architecture/decisions/0011-user-owned-export-and-erasure.md)
- [ADR-0059](../architecture/decisions/0059-privacy-custody-read-authority.md)
- [ADR-0077](../architecture/decisions/0077-optional-consent-revocation-response-loss-recovery.md)
- [ADR-0078](../architecture/decisions/0078-portable-export-client-artifact-validation.md)
- [Privacy ownership model](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [Architecture baseline](../architecture/ARCHITECTURE.md)
- [Design system review](../design/DESIGN_SYSTEM.md)

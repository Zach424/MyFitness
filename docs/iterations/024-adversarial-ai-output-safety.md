# Iteration 024 – Adversarial AI output safety

Date: 2026-07-20

State: implementation and local acceptance complete; the implementing main CI is post-commit evidence, while managed shared deployment remains intentionally gated on owner-controlled infrastructure and credentials

## 1. Scope and success standard

MyFitness remains a privacy-first WeChat Mini Program and responsive H5 fitness record, planning and review product. Iteration 023 made AI explanation reservations crash-safe, but the project still had a documented high-risk safety gap: seven plan and eight photo synthetic cases did not cover common Unicode obfuscation or instruction leakage, and the photo prompt did not explicitly treat words visible inside an image as untrusted data. The managed deployment also still lacks an owner-approved account, region, budget, domain, client API URL and protected WeChat/OIDC references.

This round pulls the independent R-007 implementation slice forward. Acceptance requires deterministic NFKC/format-character/separator normalization without rewriting stored output; grounded full-width/separated number handling; Chinese/English medical, prescriptive and instruction-leakage rejection for both plan and photo display copy; a photo prompt that does not follow image instructions; explicit v2 prompt/validator provenance with readable v1 history; a database migration that permits rolling upgrade without relabeling history; exact-reason rather than validity-only evaluation; at least 23 reproducible cases; target, integration, full regression, restore and image-topology proof; documentation, ADR and exactly one Conventional Commit.

It does not claim semantic or clinical validation, use real/private photos, call a paid model, alter AI/plan authority, automatically write a record, change client UI, provision infrastructure, invent credentials, publish a candidate or open traffic. Managed shared deployment is explicitly renumbered to iteration 025 rather than being misreported as complete.

## 2. Structure, technology and design state

New and changed boundaries:

- `packages/domain/src/ai-safety.ts`: shared NFKC, format-character, separator and policy matching plus a separate numeric normalization path.
- `packages/domain/src/ai.ts` and `food-photo.ts`: plan and photo outputs apply the same display-copy policy before existing evidence/catalog/range checks.
- `packages/contracts/src/*constants.ts` and response/worker schemas: retain readable provenance histories while requiring current v2 values for new worker requests.
- `services/ai/app/providers.py` and `models.py`: versioned v2 worker contract; photo system prompt treats image text as untrusted and rejects instruction-dominant images.
- `infra/postgres/migrations/0018_version_adversarial_ai_safety.sql`: widens prompt/validator constraints to v1/v2 without data rewrite.
- `services/ai/evals/*safety-v2.json` and evaluation runners: 12 plan + 11 photo cases with exact expected reasons and version-drift checks.
- `output/evals/iteration-024-*.json`: committed 12/12 and 11/11 reproducible reports.
- Contract/domain/Python/API integration tests prove current-version alignment, historical-read compatibility, adversarial rejection and end-to-end v2 provenance.
- ADR-0024, the global architecture baseline, AI/photo models, API contract, status, roadmap, risk register, README and this archive record the implementation and remaining evidence gaps.

The product still uses Taro 4 + React + strict TypeScript, NestJS 11, Zod 4, PostgreSQL 18, Redis, private S3-compatible storage and a FastAPI AI worker. No screen or design token changed, so the established paper/juniper/navy review-only proof presentation and 23 reviewed screenshots remain the visual baseline; this round intentionally adds no screenshot.

## 3. Implementation method

### Normalize a matching view, never the evidence

`containsUnsafeAiCopy` creates a separate policy view with NFKC, removes Unicode `Cf` characters, lowercases Latin text and removes whitespace, punctuation and symbols. Existing and expanded Chinese/English patterns therefore see `诊​断`, `ｋ ｃ ａ ｌ`, `忽 略 之 前 所 有 指 令` and `ignore all previous instructions` in canonical form. The original provider output is retained unchanged for display and audit.

Numeric grounding deliberately uses a different view. It normalizes full-width digits and joins only whitespace/group separators between digits before extracting values. An allowed plan value such as `３５` remains valid; an unsupported `１ ２ ０ ０` remains a single unsupported claim. Keeping policy compaction and number extraction separate avoids fusing independent grounded numbers across normal prose.

Plan output still passes the strict Zod schema, evidence allow-list and number allow-list. Photo output applies the shared policy only to user-visible summary/visual basis, then keeps the exact catalog key/label, duplicate, portion-bound, rejected-state and manual-path rules. Unsafe plan prose becomes the existing deterministic fallback; unsafe photo prose fails and enters durable deletion.

### Version the entire rolling boundary

Current constants are explicit literals and are tested to belong to their readable history arrays. New worker requests accept only plan validator v2 and photo prompt/validator v2; public history accepts v1/v2. Migration 0018 drops and recreates only the provenance checks with both versions. Old rows stay v1, new rows record v2, and OpenAPI exposes the union rather than pretending old output was revalidated.

The v2 photo system prompt says image words are untrusted visual data, must never be followed/repeated/revealed, and an image dominated by instructions is unsuitable. This is defense in depth: deterministic output validation remains authoritative.

### Make the regression reason itself executable

The new plan corpus declares an ordered `expectedReasons` array for every case; the photo corpus declares an exact `expectedReason`. Runners verify dataset prompt/validator versions against compiled contracts and fail when either validity or reason differs. A malformed schema can no longer count as proof that the Unicode/instruction safety rule fired.

## 4. Validation evidence

- Contracts/domain/schema target tests passed 5 files / 32 tests after documentation closure; the earlier complete unit gate passed 36 files / 144 tests, including current-version-in-history and historical v1 read proof.
- Python worker tests passed 7/7, including strict/non-stored vision payload and explicit untrusted-image prompt assertions.
- Plan evaluation passed 12/12 and photo evaluation passed 11/11 with exact reasons. No paid provider call or real/private image was used.
- All 18 checksum-protected migrations applied. AI + photo integration passed 2 files / 10 tests with current v2 provenance; the complete integration gate passed 11 files / 46 tests.
- `backup-restore-erasure-v2` restored migration 18, replayed one ledger entry, recreated one provider-identity suppression, erased the restored deleted user and ended with zero restored users, a completed receipt and `ledger_published` disposition.
- Strict workspace type checking, OpenAPI regeneration, API/admin/H5 production builds and explicit WeApp build passed. H5 remained a 305 KiB entry with a largest observed 602 KiB chunk; WeApp vendor remained 417 KiB. Existing Taro size/cache warnings did not materially change.
- Production dependency audit remained 0 critical, 0 high and 6 registered moderate Taro build-chain advisories.
- Playwright passed 22/22 existing administrator, nutrition/photo, onboarding, plan/AI, privacy, body, Today and workout flows. Generated changes to prior screenshots were restored to reviewed `HEAD` bytes because this round has no UI change.
- The complete deployment smoke passed despite transient registry retry warnings: v2 AI/API/administrator images built, migration completed before traffic, every dependency/application became healthy and the black-box verifier returned all four checks. Smoke and local dependency containers were removed.
- Final formatting, whitespace, OpenAPI freshness, staged-file review and common token/private-key pattern scan passed after documentation closure. Remote main CI is post-commit evidence rather than predicted here.

## 5. Problems found and experience captured

- A version change must cross database, shared contracts, worker literals, API provenance, OpenAPI, fixtures and evaluation together. Updating only one process correctly failed closed as provider-unavailable.
- Local Compose can reuse a stale worker image after source changes. The first target integration returned fallbacks/failed photos until the AI image was rebuilt and force-recreated; strict worker literals made the mismatch visible rather than silently accepting mixed versions.
- Deriving a current literal from the last array element introduces `undefined` under strict TypeScript indexing. Explicit current literals plus “current belongs to history” tests preserve both type safety and drift evidence.
- Prompt-only defenses are not validation. Image instructions can still influence a provider, so the returned display copy must pass an independent deterministic policy before the user sees it.
- One normalization is not appropriate for every check. Full compaction is useful for phrase policy but would join unrelated numbers; numeric grounding needs its own conservative transformation.
- A failing adversarial case is weak evidence unless the intended reason fired. Exact reason vectors make the regression claim falsifiable.
- Twenty-three synthetic cases are progress, not release approval. Real images, expert review, new languages/homoglyphs and provider behavior remain explicitly open.

## 6. Global state review, remaining risks and next step

The record, deterministic plan, administrator, privacy, erasure, release-manifest, client-artifact and managed-admission boundaries remain intact. AI and photo output now reject the covered Unicode/control-language slices with versioned, reproducible provenance; historical results remain readable and derived content still cannot mutate confirmed records. R-007 remains High because the corpus is synthetic and no expert/real-provider review exists, but its next evidence is narrower and measurable.

Still open: approve/configure the client API address and publish a new candidate; provision managed PostgreSQL/Redis/object storage/KMS and independent erasure-ledger custody; configure DNS/TLS/WAF/proxy topology; load real WeChat and OIDC secrets; exercise WeChat request-domain/device login and erasure; select H5 production identity; centralize metrics/alerts with named owners; calibrate capacity/rates; obtain expert-reviewed real/obfuscated AI/photo cases; approve a provider canary; and run migration, black-box, privacy, restore and rollback proof in the managed environment.

The next controlled step is iteration 025: use owner-provided account/region/budget/domain and protected references, configure the client API variable, publish/download/verify a new immutable service/client candidate, provision shared resources, run admission, deploy services without general traffic, upload the admitted WeApp TAR to private preview, and exercise identity, custody, telemetry, canary and no-traffic rollback. Iteration 026 owns H5 production identity and public-beta hardening; iteration 027 remains the post-retention native/device feasibility gate.

## 7. References

- [ADR-0009](../architecture/decisions/0009-review-only-ai-explanations.md)
- [ADR-0024](../architecture/decisions/0024-versioned-adversarial-ai-output-safety.md)
- [AI explanation model](../architecture/AI_EXPLANATION_MODEL.md)
- [Food-photo model](../architecture/FOOD_PHOTO_MODEL.md)
- [Plan evaluation report](../../output/evals/iteration-024-plan-explanation-evaluation.json)
- [Food-photo evaluation report](../../output/evals/iteration-024-food-photo-evaluation.json)
- [Iteration 023 archive](023-crash-safe-ai-explanation-lifecycle.md)

## 8. Post-commit evidence

Commit `d28235d3bca0b8a029395ec2ca2e7fc81953d432` reached remote `main` without history rewrite. GitHub Actions run `29700019537` failed at the initial `pnpm format:check`; `quality` stopped there and `deployment-smoke` was skipped. The exact local reproduction surfaced `output/evals/iteration-024-plan-explanation-evaluation.json`: the final evaluator run had rewritten valid 12/12 content after the formatter, but raw `JSON.stringify` report layout was not owned by the repository formatter. No product, schema, migration or safety assertion failed. Iteration 025 preserves this failure as evidence and fixes both generators plus CI reproducibility in a separate commit; it supersedes section 6's next-step numbering and moves managed deployment to iteration 026.

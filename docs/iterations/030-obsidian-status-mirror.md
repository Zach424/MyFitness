# Iteration 030 — Authoritative project status and Obsidian mirror

Date: 2026-08-04

State: implementation and local acceptance complete; the implementing exact-SHA hosted CI is post-commit evidence, while owner-operated cloud, domain, real identity and paid-provider work remains parked rather than waived

## 1. Scope and success standard

The repository already required every implementation round to update `docs/PROJECT_STATUS.md`, but the owner also needs the same status inside the computer's Obsidian knowledge base. Copying it manually after every round would create two editable sources and make silent drift likely. This round closes that workflow gap with one bounded scope: keep the repository file authoritative and add a dependency-free, deterministic write/verify command for a local Obsidian mirror.

Success requires discovery of the configured vault without hard-coding the owner's path; deterministic selection when several vaults exist; an explicit vault override; a target that cannot escape the selected vault; byte-identical copying; an independent stale/missing check; proportional unit tests; repository workflow and README guidance; an actual mirror inside the configured vault; updated global status/roadmap; one archive and one Conventional Commit.

This round does not add product behavior, put Obsidian content into Git, install an Obsidian plugin, edit vault configuration, claim cloud readiness, connect a real AI provider or consume an external API. The local product runtime was re-exercised because the owner asked to see the agent, but no demo data or runtime log is committed.

## 2. Structure, technology and design state

Changed boundaries:

- `scripts/sync-project-status-to-obsidian.mjs` owns vault discovery, contained target resolution, exact-byte write/verify behavior and the CLI.
- `scripts/sync-project-status-to-obsidian.test.ts` covers vault selection, traversal rejection, exact copying and stale-state failure.
- root `package.json` exposes `docs:sync-obsidian` and `docs:verify-obsidian`.
- `AGENTS.md` adds the local-vault mirror and verification to the required round protocol while retaining the repository file as the authority.
- `README.md` documents discovery, overrides, target semantics and the no-commit boundary.
- `docs/PROJECT_STATUS.md` and `docs/product/ROADMAP.md` record the owner's local-first priority: locally verifiable product work continues while manual cloud/identity/provider inputs remain mandatory but parked.
- the configured local target is `C:\Users\陈志庆\Documents\Obsidian Vault\10_Projects\MyFitness\PROJECT_STATUS.md`; it is outside the repository and is not staged.

Technology remains Node.js ESM and the existing pnpm/Vitest/Prettier toolchain. The mirror adds no runtime or package dependency. It reads the standard `%APPDATA%/obsidian/obsidian.json` inventory, prioritizes open vaults and then the newest timestamp, and permits `OBSIDIAN_VAULT_PATH` for an explicit selection. `MYFITNESS_OBSIDIAN_STATUS_TARGET` can change the relative destination inside the vault.

The documentation design deliberately avoids generated frontmatter, backlinks or a second metadata envelope. Exact repository bytes make the Obsidian page directly readable while keeping one comparison rule: either the files are identical or verification fails.

## 3. Implementation method

### Select one local authority boundary

The repository status is the only editable authority. The synchronizer parses and validates the Obsidian vault inventory, rejects missing or malformed paths, sorts candidates by open state, timestamp and path, and resolves the winner to an absolute directory. An explicit vault path bypasses inventory selection without changing the same downstream checks.

The target must be a non-empty relative path. Resolution compares the final path with the exact vault root and rejects absolute paths, the vault root itself and every `..` escape. The selected vault must already exist as a directory; the tool creates only the nested MyFitness destination.

### Separate mutation from proof

`write` creates the destination directory and copies the source buffer without text conversion. `verify` performs no write: it reads the destination and rejects a missing or byte-different mirror. Both return source, target, byte count and SHA-256 so an iteration report can retain compact reproducible evidence.

The CLI accepts `write` or `verify` plus explicit `--vault`, `--config`, `--source` and `--target` options. Tests use temporary vaults and sources through the same exported implementation rather than duplicating the logic.

### Keep external work parked, not erased

The roadmap moves managed shared deployment from iteration 30 to iteration 32 and assigns iteration 31 to privacy-first progress-photo assistance. Real WeChat/OIDC credentials, domain/TLS, managed custody, telemetry, paid-provider approval and release filing remain public-delivery gates. This sequencing follows the owner's instruction to continue autonomous local product work and leave owner-operated integrations until later; it does not weaken admission or safety rules.

## 4. Validation evidence

- Focused mirror validation passed 1 file / 3 tests. It selected the newest open vault, rejected absolute/traversing targets, copied exact bytes, verified a current mirror and failed a deliberately stale mirror.
- Actual `pnpm docs:sync-obsidian` wrote 19,923 bytes to the configured vault. `pnpm docs:verify-obsidian` independently passed with SHA-256 `fde567153d31361c1a0818e7e966b4de4803765ba920d83a496d5befecfebd6a` for both source and target.
- Full Vitest passed 40 files / 165 tests. Strict TypeScript passed all six product/shared workspaces. Full repository formatting passed.
- A product build or integration/database suite was not repeated because this round changes no application bundle, API contract, schema or runtime dependency. The broader unit/type/format checks cover every changed repository boundary.
- The local experience requested by the owner was exercised separately: PostgreSQL, Redis, MinIO and fixture AI reached healthy state; all 19 migrations were already applied; API readiness returned HTTP 200 with database/Redis/object storage `up`; fixture AI returned HTTP 200; H5 returned HTTP 200.
- In the visible H5, a local demo profile named `小衡` completed adult/safety consent, generated the 2026-08-03—08-09 conservative weekly plan, and produced the fixture **AI MARGIN NOTE**. The result explained time, experience, recovery evidence and qualitative food focus without modifying the deterministic plan or sending data to an external provider.

## 5. Problems found and experience captured

- The Obsidian application was not running, but its standard configuration still identified one currently selected vault. Synchronization therefore depends on the file-backed vault contract, not a desktop process or plugin.
- A rich Obsidian wrapper would have made the mirror more attractive but would break byte equality and create merge ownership ambiguity. Exact content is the stronger operating contract; Obsidian-specific indexes can link to this page separately.
- The first documentation patch needed Prettier normalization, which changed the status byte count and digest. The mirror was rewritten only after formatting, then verified again. Final-format-before-sync is now explicit in the iteration sequence.
- Docker Desktop entered a stuck `starting` state during the final runtime recheck. Its own restart command could not stop duplicated frontend/backend processes. Only processes whose resolved executable paths were inside `C:\Program Files\Docker\Docker\` were stopped; no container or volume removal command was used. A single clean restart restored the preserved data volumes and all four healthy services, after which API/AI/H5 were rechecked.
- A green H5 response alone is insufficient runtime evidence: while Docker was unavailable the static H5 still returned 200 but API readiness correctly returned 503. Future local handoffs must check API readiness and AI health as well as the page.
- Local knowledge-base mirroring is useful operational evidence but is not a release artifact. CI must not require a personal vault, and no absolute owner path belongs in source-controlled configuration.

## 6. Global state review, remaining risks and next step

Iteration governance now has a repeatable local mirror instead of an informal promise. The repository remains cleanly responsible for project truth, while the owner's Obsidian receives the same status and can detect a skipped or stale update. The product is still an internal alpha: local onboarding, records, planning, fixture AI, privacy, release engineering and deployment admission are substantial, but public delivery lacks real identity, managed custody, telemetry, approved provider evidence and owner-operated infrastructure.

The primary next local gap is explicit in the original product brief and current code audit: food-photo assistance exists, while progress/body-photo assistance appears only in product documentation. Iteration 31 will implement a privacy-first progress-photo candidate limited to capture consistency, pose/alignment guidance and user-controlled visual comparison. It must not diagnose posture disorders or infer exact body-fat percentage; it must use separate consent, EXIF removal, private expiring objects, clear machine-estimate labels, explicit retention/deletion and end-to-end privacy evidence.

Useful later local candidates remain the demo-food-catalog replacement with licensed provenance, proactive stale-plan refresh, server-authoritative workout completion, bundle budgets and large-text/keyboard accessibility. External account/domain/API tasks remain recorded for iteration 32 and are not silently treated as complete.

## 7. References

- [Iteration 029 archive](029-h5-oidc-browser-candidate.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Product brief](../product/PRODUCT_BRIEF.md)
- [Repository working agreement](../../AGENTS.md)
- [Project README](../../README.md)

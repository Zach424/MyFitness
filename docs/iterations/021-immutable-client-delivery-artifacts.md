# Iteration 021 — Immutable client delivery artifacts

Date: 2026-07-19

State: implementation and local acceptance complete; the implementing main CI is post-commit evidence, while a new tagged candidate and managed delivery remain intentionally gated on owner-controlled inputs

## 1. Scope and success standard

MyFitness remains a privacy-first WeChat Mini Program and responsive H5 fitness record, planning and review product. Iteration 020's implementing main CI `29692031372` passed all 34 files / 122 unit tests, 11 files / 42 integration tests and deployment smoke. The published `v0.1.0-rc.1` record identifies API, administrator and AI images only. H5 and WeApp could still be rebuilt with different environment inputs or archived with local metadata, so admission could not prove which client bytes would be delivered.

This round implements one bounded client-release control plane. Acceptance requires deterministic H5 and WeApp archives; safe/canonical archive verification; embedded version/repository/full-SHA/workflow/API/auth metadata; one strict cross-platform manifest; service/client identity binding; tag-workflow publication; actual-byte admission; complete rollback pairs; proportional negative tests; documentation, ADR and exactly one Conventional Commit.

It does not publish a new tag, invent a domain, provision cloud resources, configure a real AppID, distribute a Mini Program, open H5 traffic or add a production H5 identity. The existing release is not mutated. No product API, database schema, AI behavior, health rule, client flow or visual design changes in this round.

## 2. Structure, technology and design state

New and changed boundaries:

- `scripts/client-release.mjs`: dependency-free Node 24 metadata, deterministic USTAR, manifest, actual-archive verification and CLI control plane.
- `scripts/client-release.test.ts`: nine deterministic, schema, tamper, coherence and real-file CLI cases.
- `apps/client/config/index.ts`: a release-only webpack plugin emits `myfitness-client-build/v1`; local non-release builds remain unchanged.
- `.github/workflows/publish-images.yml`: pre-publication qualification, Taro client builds, client bundle publication and final service/client coherence gate.
- `scripts/deployment-admission.mjs` and its tests: `myfitness-deployment-admission/v2`, client-manifest/checksum/TAR inputs, API-origin binding, guarded client delivery and complete client rollback.
- `package.json`: `pnpm release:client -- <command>` exposes qualification, packaging, assembly and verification.
- ADR-0021, README, project status, roadmap, risk register and deployment runbook document the release/delivery boundary.

The service schema remains `myfitness-release/v1`. The new schemas are `myfitness-client-build/v1`, `myfitness-client-release-fragment/v1` and `myfitness-client-release/v1`. `myfitness-managed-environment/v1` is unchanged. Admission v2 contains both manifest digests, three immutable image references, two immutable client records, seven service actions, four client actions and one explicit rollback mode.

H5 is deliberately `preview-only`, uses the `static-host` adapter and retains `dev` authentication because no production H5 identity exists. WeApp is a `candidate`, uses `wechat-code-upload` and requires `wechat` authentication. These states are embedded and schema-validated. The delivery plan therefore blocks H5 public traffic and limits the exact WeApp TAR to private preview before real-device identity and custody evidence.

## 3. Implementation method

### Canonical bytes, not just a source directory

The packager recursively reads regular files, rejects symlinks and unsafe/duplicate paths, sorts canonical `/` paths, and writes USTAR headers with mode `0644`, UID/GID `0`, mtime `0`, fixed checksum encoding, zero padding and the canonical two-block terminator. Verification checks the TAR checksum and metadata, parses every entry, rejects traversal/types/order drift, recreates the archive byte-for-byte, checks required entrypoints and embedded metadata, and recomputes file count, unpacked bytes and a path/length/content tree SHA-256. The manifest also binds the entire TAR SHA-256 and byte length.

The real release-mode Taro builds emitted the metadata file without changing application bundles. Packaging the same output into two independent directories produced byte-identical files. The synthetic release-build fixture measured H5 at 24 files / 4,328,960 archive bytes / 4,309,688 unpacked bytes with TAR digest `sha256:a3235b02d92f5a1023705060e4e3a9cab8487ceefd2157f4b6a2787e95cfa6e7` and tree digest `sha256:9d6695b7ee5b6a1e3dc35ca585e9565a016dda2d0f1be947b385075116675f6d`. WeApp measured 44 files / 1,075,200 archive bytes / 1,037,304 unpacked bytes with TAR digest `sha256:3b3e48b3b3d2d062f41e4181d2102c222f2febbed6efa1bc1ef7df8f6792ccc2` and tree digest `sha256:f7275fab74fe79d219cdfff052b2fdc26562f9d664456ff1e3c370b63dc91816`. These values prove the packaging test only; they are not a published candidate.

### One workflow identity and fail-closed release inputs

The tag workflow first validates the SemVer/ref and repository variable `MYFITNESS_CLIENT_API_BASE_URL`. It rejects absent, HTTP, IP, localhost, single-label, test/example/internal, credential-bearing, port, query, fragment and non-canonical `/v1` values before the image jobs receive permission to publish. Service image publication and qualified client builds then run in parallel. Release assembly refuses mixed version, repository, revision, workflow attempt or API base, verifies both actual TARs against the service manifest, creates both checksums and refuses to replace an existing GitHub Release.

The current `v0.1.0-rc.1` assets remain service-only immutable history. A new tag is required after an actual owner approves the API address. A domain-shaped string passing syntax is not evidence of DNS/TLS ownership.

### Admission and rollback consume complete pairs

The admission CLI first hashes exact service/client manifest bytes using their fixed `sha256sum` filenames, validates both schemas, verifies both actual TARs and binds their version/source/workflow. The API base must equal the managed environment's `apiOrigin` plus `/v1`. The output retains all client artifact summaries and adds an explicit byte-check/H5-hold/WeApp-private-preview/device-evidence sequence.

First shared test may still use `no-traffic`. Production `previous-release` now requires the older service manifest/checksum plus client manifest/checksum/artifact directory. The previous pair must be coherent, older and from a different version/revision; rollback cannot mix images and clients or rebuild source.

## 4. Validation evidence

- Node syntax validation passed for both dependency-free CLIs; client TypeScript strict checking passed with the Taro-owned webpack-chain type.
- Targeted client/admission tests passed 2 files / 21 tests. They cover byte-identical TARs, canonical headers/terminators, traversal/duplicate paths, required entrypoints, embedded metadata, auth/delivery classes, API qualification, mixed source/run/API rejection, service/client coherence, both transport checksums, actual TAR tampering, managed API binding, guarded client order and complete rollback pairs.
- Real release-mode Taro H5 and WeApp production builds passed and emitted the expected metadata: H5 `dev/preview-only`, WeApp `wechat/candidate`, one source/workflow/API base. H5 retained the registered 305 KiB entry and 527–598 KiB large chunks; WeApp retained the 417 KiB vendor warning and known non-blocking Taro cache warning.
- Two independent packaging passes over each real Taro output were byte-identical; the detailed archive/tree measurements are recorded in section 3. All temporary artifacts were removed and `dist-*` remained ignored.
- Repository formatting and whitespace checks passed. The production audit remained 0 critical, 0 high and 6 registered moderate Taro build-chain advisories. Contracts/domain builds plus the complete workspace type check passed.
- The complete dependency-free unit gate passed 35 files / 132 tests. AI Worker tests passed 7/7, plan-explanation evaluation 7/7 and food-photo evaluation 8/8 using fixtures; no paid model call occurred.
- API, administrator, ordinary H5 and ordinary WeApp production builds passed in addition to the release-metadata builds. Registered bundle and cache warnings did not change.
- All 15 migrations applied/verified. The integration gate passed 11 files / 42 tests. `backup-restore-erasure-v2` restored migration 15, replayed one ledger entry, recreated one provider-identity suppression, erased the restored deleted user and ended with zero restored users, a completed receipt and `ledger_published` disposition.
- Playwright passed 21/21 administrator, nutrition/photo, onboarding, plan/AI, privacy, body, Today and workout flows. The only generated tracked differences were one evaluation JSON and 17 existing screenshots; they were verified and restored to reviewed `HEAD` bytes.
- The complete three-image deployment smoke passed once despite transient registry retry warnings: pinned AI/API/administrator images and attestations built, migration completed before traffic, dependencies and application images became healthy, and the black-box verifier returned all four expected checks. Every smoke container/network/volume was removed; local dependencies were stopped.
- Final format, diff, schema-reference, workflow-input and sensitive-value scans run after documentation closure. Remote main CI is post-commit evidence rather than predicted here.

## 5. Problems found and experience captured

- A Git SHA does not identify client runtime inputs. API address and authentication mode must be embedded in the compiled root and repeated in a strict manifest.
- Deterministic source content does not guarantee a deterministic archive. Tar timestamps, ownership, permissions, order, padding and header variants need a closed writer and a canonical re-encoder.
- Hashing only an unpacked tree loses transport identity; hashing only a TAR makes review opaque. Binding both archive and tree summaries makes transport tampering fail while retaining inspectable content evidence.
- Static H5 and WeChat upload bundles have different delivery mechanics from OCI images. A sibling client manifest keeps those semantics explicit while service/client coherence belongs at release assembly and deployment admission.
- “Built successfully” is not “safe to distribute.” H5's development issuer is production-disabled, so its honest state is a verified preview artifact held from traffic.
- Publishing service jobs before validating the client URL could leave partial registry artifacts after a missing input. A permission-free qualification job must precede both publication branches.
- Existing immutable releases cannot be upgraded in place. Schema evolution applies to the next candidate and preserves the old release as historical evidence.

## 6. Global state review, remaining risks and next step

The recording, planning, AI, photo, privacy, administrator, service-image and managed-environment boundaries remain intact. Client build outputs now have a reproducible local control plane and admission can no longer accept service images without matching H5/WeApp bytes. The publication workflow is ready but intentionally not exercised because the repository has no owner-approved client API URL; `v0.1.0-rc.1` therefore remains service-only.

Still open: approve/configure the client API address and publish a new candidate; provision managed PostgreSQL/Redis/object storage/KMS and independent erasure-ledger custody; configure DNS/TLS/WAF/proxy topology; load real WeChat and OIDC secrets; exercise WeChat request-domain/device login and erasure; select H5 production identity; centralize telemetry/alerts; calibrate capacity/rates; approve an AI provider canary; and run migration, black-box, privacy, restore and rollback proof in the managed environment.

The next controlled step is iteration 022: use owner-provided account/region/budget/domain and protected references, configure the client API variable, publish/download/verify a new immutable service/client candidate, provision shared resources, run admission, deploy services without general traffic, upload the admitted WeApp TAR to private preview, and exercise identity, custody, telemetry, canary and no-traffic rollback. Iteration 023 owns H5 production identity and public beta hardening.

## 7. References

- [Baseline main CI run 29692031372](https://github.com/Zach424/MyFitness/actions/runs/29692031372)
- [Candidate release v0.1.0-rc.1](https://github.com/Zach424/MyFitness/releases/tag/v0.1.0-rc.1)
- [ADR-0019](../architecture/decisions/0019-immutable-release-promotion.md)
- [ADR-0020](../architecture/decisions/0020-managed-environment-admission.md)
- [ADR-0021](../architecture/decisions/0021-immutable-client-delivery-artifacts.md)
- [Deployment runbook](../operations/DEPLOYMENT_RUNBOOK.md)

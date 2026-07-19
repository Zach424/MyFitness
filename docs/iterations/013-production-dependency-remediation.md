# Iteration 013 — Production dependency remediation

Date: 2026-07-19

State: complete locally for the zero-critical/high production dependency gate; six moderate Taro build/development-chain findings remain open

## 1. Scope

Remove the critical and high production dependency advisories identified in iteration 012 without changing product behavior or replacing the multi-end framework. This round is limited to an auditable dependency graph change, dual-client compatibility proof and release-control documentation. Administrator identity/RBAC, support UI, durable jobs, production identity and deployment remain separate iterations. Acceptance requires a frozen lockfile install, zero critical/high production audit, no peer errors, full existing regression, both client builds, one archive and one local commit.

## 2. Structure, technology and implementation

- Root `package.json`: added the explicit `pnpm audit:prod` high-severity gate and pinned Vite 8.1.5 for the Vitest 4.1.10 test boundary.
- `apps/client/package.json`: moved the Taro client compiler to exact Vite 6.4.3 and webpack 5.104.1 security floors.
- `pnpm-workspace.yaml`: added eight parent-qualified pnpm overrides around Taro 4.2.1 for `swiper 12.1.2`, `lodash-es 4.18.1`, Vite 6.4.3 and webpack 5.104.1.
- `pnpm-lock.yaml`: regenerated and verified through `pnpm install --frozen-lockfile`.
- Product/API/contracts/database/UI behavior did not change. H5 and WeApp remain built from `apps/client`; the API, worker and shared packages keep their existing boundaries.

Implementation method: inspect each advisory path and current upstream package manifests, choose the smallest parent edge that owns the affected version, then make the resolved graph observable with `pnpm why` and `pnpm peers check`. The client compiler uses the patched Vite 6 line that passed Taro's peer check and both production builds; the independent Vitest runtime stays on Vite 8. Swiper, lodash-es and webpack resolve to one client version each. Overrides are removal-tracked compatibility floors, not permanent forks.

## 3. Release-control design archive

There is no visual product change in this round. The designed surface is the dependency boundary and its promotion rule:

```text
Taro 4.2.1 parent edge
  -> exact reviewed security floor
  -> frozen lockfile
  -> peer/type/test/dual-build/E2E evidence
  -> critical/high audit gate
  -> local commit
```

The graph deliberately has two Vite lanes: Vite 6.4.3 belongs to the Taro client compiler, and Vite 8.1.5 belongs to Vitest. Lower-severity residuals stay visible in the risk register and raw audit rather than being hidden by the release command. The complete decision and override exit condition are recorded in [ADR-0013](../architecture/decisions/0013-auditable-transitive-security-floors.md).

## 4. Validation evidence

- Baseline `pnpm audit --prod`: 20 findings — 1 critical, 3 high, 12 moderate and 4 low.
- Final `pnpm audit:prod`: exit 0 with 0 critical, 0 high, 6 moderate and 0 low findings. Residuals are one `esbuild`, four `webpack-dev-server` and one nested `uuid` advisory.
- `pnpm install --frozen-lockfile`, `pnpm peers check` and full workspace typecheck passed.
- `pnpm test`: 29 files / 87 tests passed. `pnpm test:integration`: 9 files / 31 tests passed. `pnpm test:ai`: 7 tests passed.
- API/OpenAPI build and generation passed; 7/7 plan-explanation and 8/8 food-photo fixture evaluations passed without a paid model call.
- H5 and WeApp production builds passed on webpack 5.104.1. H5 build output confirmed `swiper 12.1.2` and `lodash-es 4.18.1`; 19/19 Chromium flows passed afterward.
- The existing R-009 performance warnings remain: H5 entry 305 KiB, largest chunk 589 KiB and WeApp vendor 417 KiB. The dependency change did not resolve or conceal that release risk.
- Local PostgreSQL, Redis and fixture AI services are healthy. Validation cleanup leaves zero users, zero erasure receipts, no private uploads and no test rate-limit keys.

## 5. Problems found and experience captured

- pnpm 11.9 ignores `pnpm.overrides` in `package.json` and emits a warning; workspace overrides belong in `pnpm-workspace.yaml`. A lockfile diff is required to prove a remediation actually changed resolution.
- A broad Vite override silently moved Vitest from Vite 8 to Vite 6. Typecheck still passed, but the OpenAPI mocks failed and exposed the cross-toolchain coupling. Pinning root Vite 8 and scoping only the Taro parent edge restored the suite.
- A single runner-level webpack override was too narrow. `pnpm peers check` exposed Taro loader and prebundle packages that still expected webpack 5.91.0; exact parent overrides brought the entire client path to webpack 5.104.1 without peer errors.
- An audit's suggested version may not exist on the registry. The lodash-es high advisory displayed an unusable patched floor, so the current published release and actual lock graph had to be verified rather than copied mechanically.
- Zero critical/high is a release gate, not a clean bill of health. The six moderate findings are development/build-chain exposures, but they still require supported upstream upgrades and safe local-development practices.

## 6. Remaining risks and next step

R-015 remains open at medium severity for `esbuild 0.21.5`, `webpack-dev-server 4.15.2` and nested `uuid 8.3.2`. Taro upgrade review must attempt removal of every local override and rerun this round's graph and behavior evidence. R-009 bundle sizes, verified end-user identity, operator identity, immutable audit, centralized telemetry, private object storage, durable reconciliation, backup/provider deletion evidence, legal review and a real shared environment still block release.

Iteration 014: implement the administrator trust boundary as one thin vertical slice — verified operator identity, least-privilege RBAC, append-only audit, read-only user lookup and a restrained support console — while preserving the user-data ownership and operations boundaries already established.

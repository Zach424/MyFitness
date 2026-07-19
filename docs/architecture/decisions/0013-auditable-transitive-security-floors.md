# ADR-0013: Auditable transitive security floors around the Taro client

Date: 2026-07-19

Status: accepted

## Context

The iteration-012 production audit reported 20 advisories, including one critical and three high findings. The affected `swiper`, `lodash-es`, Vite and webpack versions entered through Taro 4.2.1 or its build runner. Taro 4.2.1 was still the current stable release when this decision was made, and its manifests still selected the affected dependency ranges or exact versions. Replacing the application framework or forcing every transitive build dependency across a major boundary would be a larger, less reviewable change than the vulnerability remediation itself.

The repository also uses Vitest 4.1.10, whose Vite 8 toolchain must remain independent from the Taro client compiler. A graph-wide Vite override changed Vitest's runtime and caused the OpenAPI suite to fail even though application source had not changed.

## Decision

- Keep Taro packages aligned on 4.2.1 until a supported stable release removes the need for local floors.
- Declare exact, parent-qualified pnpm workspace overrides only for the affected Taro edges: `swiper 12.1.2`, `lodash-es 4.18.1`, Vite `6.4.3` and webpack `5.104.1`.
- Declare the client compiler versions directly in `apps/client`, while pinning root Vite `8.1.5` so Vitest keeps its tested toolchain.
- Check peer compatibility after every override and require frozen install, typecheck, unit/integration/worker tests, both client production builds and all browser flows before accepting the graph.
- Make `pnpm audit:prod` the release gate for critical/high production advisories. Continue reporting lower-severity findings instead of calling the dependency graph clean.
- Remove each override when an adopted Taro release selects an equal or newer compatible version and the same validation set passes without it.

## Consequences

The production audit falls from 20 findings to six moderate findings, with no critical or high advisory. The lockfile has one resolved `swiper`, `lodash-es` and webpack version for the client paths, while Taro Vite 6 and Vitest Vite 8 remain intentionally separate.

The workspace now owns a small compatibility patch surface that upstream would otherwise own. Parent-qualified selectors and exact versions make that surface visible and reversible, but every Taro upgrade must review the overrides rather than assuming they are permanent. The remaining Taro helper/development chain contains `esbuild 0.21.5`, `webpack-dev-server 4.15.2` and its `uuid 8.3.2`; their patched releases require incompatible 0.x or major transitions. They remain R-015 and must be removed through a supported Taro/build-chain upgrade, not an untested global override.

## References

- [pnpm settings: overrides](https://pnpm.io/settings#overrides)
- [Taro releases](https://github.com/NervJS/taro/releases)

# Iteration 000 — Foundation

Date: 2026-07-18

State: complete for the local foundation baseline

## 1. Scope

Re-anchor the repository around a single objective: build a privacy-first multi-end fitness record and AI planning product whose first release is Mini Program + H5. This round establishes product boundaries, design direction, platform architecture, delivery gates, global status, and the required archive/commit workflow.

Success criteria:

- The source repository baseline is recovered locally and its origin is configured.
- Product audience, MVP, exclusions, success model, and AI safety boundary are documented.
- A distinctive, implementable visual direction and screenshot review checklist exist.
- Platform/module responsibilities and a staged roadmap exist.
- Status, risks, next gate, and future-agent working rules are discoverable from the README.
- Documentation structure and repository hygiene checks pass before one local commit.

Rollback boundary: this round changes documentation and repository metadata only. It does not create application dependencies, infrastructure, accounts, remote resources, or user data.

## 2. Changes made

- Replaced the placeholder README with project scope, target structure, documentation index, iteration rules, and repository synchronization note.
- Added a living project status with module-level `Done / Partial / Pending / Deferred` evidence.
- Defined the adult target audience, core jobs, five-area information architecture, MVP scope, explicit exclusions, metrics, and business hypothesis.
- Added a 14-iteration roadmap with internal-alpha, closed-beta, and public-release gates.
- Defined the “training logbook” visual direction, token palette, typography roles, Rhythm Rail signature, mobile/wide wireframes, content voice, accessibility and screenshot checks.
- Accepted ADR-0001 for Taro Mini Program/H5, later React Native, NestJS modular monolith, shared TypeScript packages, and a queued FastAPI AI boundary.
- Added repository instructions, EditorConfig, and ignore rules.

Why it matters: the initial repository had only one README line. These artifacts make future feature work testable against a shared product, safety, design, and architecture target instead of accumulating disconnected screens and services.

## 3. Validation evidence

Repository checks executed on the staged tree:

- `git diff --cached --check`: passed after removing Markdown trailing spaces and adding `.gitattributes` to normalize cross-platform line endings.
- Staged-tree inspection: 12 foundation files, 685 inserted lines before this final evidence update.
- Unresolved-marker scan across README, repository instructions, and `docs/`: passed.
- Local Markdown link resolver: every relative link across 9 Markdown files resolved to an existing path.
- Required-content smoke test found the project name, working Chinese name, next-iteration marker, and Rhythm Rail design concept.

Manual review confirmed that Mermaid and tables use portable Markdown, no application feature is marked implemented, and the next round contains only the client/design-token foundation.

## 4. System status update

- Product definition: done for the planning baseline; user research remains.
- Design system: done as a planned baseline; screenshot validation remains.
- Architecture: accepted for initial scaffolding; no runtime implementation exists.
- Privacy/compliance: partial; principles exist but the field inventory and consent map do not.
- Client, API, AI, data, testing, deployment: pending.

This outcome advances the product objective by freezing what the first release is and how evidence will be accumulated. It does not claim that the product itself is implemented.

## 5. Risks / open issues

- GitHub HTTPS Git traffic returns 403 in the current environment, SSH port 22 is closed, and SSH 443 has no authorized key. The public source archive is available, but authenticated fetch/push is blocked.
- Local history starts from a recovered archive rather than the remote commit object. Once access is available, local commits must be replayed onto fetched `origin/main`; force-push is not authorized.
- Working brand “衡迹” requires trademark/domain screening before public use.
- Product assumptions have not yet been tested with target users.
- Technology choices are documented but runtime/package compatibility is not yet verified.

## 6. Next step

Primary: Iteration 001 will create the pnpm workspace, Taro client, shared token package, and a fixture-backed Today shell. It must boot in H5, check the Mini Program build, render the Rhythm Rail responsively, respect reduced motion/focus, and pass screenshot review.

Deferred candidates:

- Health-record contracts and API foundation.
- Adult onboarding and consent capture.

They remain deferred until the client foundation is validated.

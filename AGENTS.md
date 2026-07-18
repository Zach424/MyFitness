# Repository working agreement

## Objective

Build MyFitness / 衡迹 as a privacy-first, multi-end fitness logging and AI planning product. The initial production target is WeChat Mini Program + H5; native health-platform integrations are a later stage.

## Required iteration protocol

Before changing code or product behavior:

1. Read `docs/PROJECT_STATUS.md`, the latest file under `docs/iterations/`, and any relevant design/architecture decision.
2. Select one bounded critical-path change with explicit acceptance criteria.
3. Implement the smallest reversible version and add proportional tests.
4. Run targeted checks before broader checks.
5. Update global module status, risks, decisions, and documentation affected by the work.
6. Add exactly one new iteration archive under `docs/iterations/` using the previous archive as the structure guide.
7. Commit the validated round with a Conventional Commit message.

Do not claim a feature is done without reproducible validation evidence. Do not mix unrelated refactors into a feature round. Preserve user changes and never force-push or rewrite shared history without explicit approval.

## Product safety rules

- Treat health metrics, photos, precise location, and device data as sensitive.
- Keep AI estimates visibly distinct from user-confirmed facts.
- Do not implement medical diagnosis, treatment claims, or unsafe calorie/training prescriptions.
- Any AI-generated plan must pass deterministic schema and safety validation before display.
- Permission, retention, export, correction, and deletion behavior are part of feature acceptance.

## Engineering defaults

- TypeScript strict mode for product applications and shared packages.
- API-first schemas shared through `packages/contracts`.
- Modular monolith before microservices; extract only from measured pressure.
- Store value, unit, source, occurrence time, timezone, and revision provenance for health records.
- Prefer accessible semantic UI, visible focus, reduced-motion support, and mobile-first responsive behavior.

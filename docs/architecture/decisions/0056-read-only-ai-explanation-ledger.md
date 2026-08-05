# ADR-0056: AI explanation history is a bounded read-only ledger

Date: 2026-08-05

Status: accepted

## Context

Weekly Plan already retained completed explanation runs, but Week Fold loaded only enough history to restore a current margin note. Older runs were not directly reviewable, and plan revision alone did not communicate whether a same-revision explanation remained usable after eligibility or evidence authority changed. Loading all provenance into the primary planning surface would enlarge its already dominant artifact and visually compete with current plan evidence. A history view must not become a second provider trigger, disclose internal provider identifiers or allow historical prose to appear as a confirmed health fact.

## Decision

- Keep the existing authenticated, owner-scoped `GET /plans/weekly/:planId/explanations` boundary at its server maximum of twenty completed runs and add `private, no-store, max-age=0` to its response.
- Open history from Week Fold on a dedicated lazy route. The route reads both owner-visible weekly plans and completed history, refuses an absent/foreign plan and never invokes explanation generation.
- Recompute display authority from the current plan projection: a matching revision is `current` only while AI explanation remains allowed, otherwise it is `frozen`; a different revision is always `history`.
- Show source, created time, prompt version, validator version, fallback/failure reason and safety note. Do not show the provider's internal model identifier, request key, consent payload or raw worker receipt.
- Render five retained runs initially and reveal at most five more per explicit action. This is client-side disclosure within the fixed server bound, not an unbounded cursor or a regeneration command.
- Historical and frozen explanations stay review-only, cannot mutate a plan or record and carry an explicit boundary from current authority.

## Consequences

Users can audit why two explanation runs differ without overloading the current Week Fold or calling the model again. Authority remains based on a fresh owner plan projection rather than immutable explanation content. The first implementation can review at most the latest twenty completed runs; server pagination is deferred until measured demand justifies a cursor contract.

The dedicated route adds 128,716 bytes to the H5 production tree and 15,370 bytes to WeApp while keeping H5 entry/largest async JavaScript at 319,232/199,198 bytes. Week Fold remains the largest WeApp page at 49,800 bytes. Budgets move narrowly to 2,607,000 H5 total, 892,000 WeApp total and 50,000 WeApp page; the existing 320,000/199,500 H5 entry/async and 25,000 vendor ceilings remain unchanged.

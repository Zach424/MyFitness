# ADR-0026: Pin the GitHub Actions supply chain to reviewed commits

Date: 2026-07-20

Status: Accepted

## Context

The source and release workflows run external actions before repository scripts can enforce product controls. Several release jobs grant `packages: write`, `id-token: write`, `attestations: write` or `contents: write`, yet every external `uses:` reference selected a movable major tag such as `@v6`. A tag owner or compromised upstream repository could move that tag after MyFitness review, changing code that receives the checkout, workflow token, package credential or OIDC identity without a source commit in this repository.

GitHub documents a full-length commit SHA as the immutable way to select an action and supports a repository policy that requires SHA pinning. An immutable reference still needs a maintainable upgrade path: freezing dependencies without surfacing new releases would trade substitution risk for silent staleness.

## Decision

All external step and reusable-workflow `uses:` references in `.github/workflows` must use a lowercase full 40-character Git commit SHA. Repository-local actions may use a relative `./` path; container actions, if introduced, must use a `sha256` digest. Branches, tags, abbreviated SHAs and mutable Docker tags are rejected.

The reviewed action set is recorded in `infra/ci/github-actions.lock.json` as `myfitness-github-actions-lock/v1`. Each sorted entry binds the lowercase action identifier, exact upstream SemVer tag, exact tag ref, full revision and verification date. For this baseline, both the major tag and exact version tag were resolved directly from the named upstream repository with `git ls-remote`; the workflow comment retains the exact SemVer for reviewers and Dependabot.

An offline Vitest gate scans every workflow line containing `uses:` and requires:

- every external action to exist in the lock;
- the workflow SHA and version comment to match that entry exactly;
- no duplicate or stale lock entry and no unknown schema field;
- sorted, unique action identifiers, canonical SemVer and full lowercase revisions;
- any future container action to use a full image digest.

`.github/dependabot.yml` monitors the `github-actions` ecosystem at repository root every week. A Dependabot proposal is only an update signal: maintainers must resolve the proposed exact tag from the original upstream repository, review release/source changes, update the lock and every usage together, and require the complete hosted CI before merge.

After the pinned workflows reach `main`, the repository Actions policy must keep `sha_pinning_required: true` while preserving the existing enabled/allowed-actions posture. The policy is external enforcement; the committed lock and tests remain reviewable and portable evidence.

## Consequences

- A moved upstream branch or tag cannot silently replace code in either workflow.
- The most privileged publication steps now execute only the reviewed Git objects listed in the lock.
- Inline version comments keep human intent visible and allow Dependabot to propose upgrades without returning workflows to tags.
- Action updates become explicit source changes that traverse formatting, unit, integration, browser and deployment-smoke gates.
- Pinning does not prove that upstream action source is defect-free, prevent a compromised revision selected during review or replace least-privilege workflow permissions.
- Dependabot availability and maintainer review are still operational dependencies; an ignored update queue can leave a safe but vulnerable or incompatible pin in place.

## Alternatives considered

- Keep trusted publishers on major tags: rejected because publisher identity does not make a mutable ref immutable.
- Pin only write-privileged jobs: rejected because checkout/setup actions in the quality gate influence the CI result later consumed by release qualification.
- Pin SHAs without version comments or a lock: rejected because drift, duplicate updates and upstream release intent would be difficult to review consistently.
- Automatically accept Dependabot action updates: rejected because a new immutable SHA still requires upstream provenance, behavior and compatibility review.

## Rollback

If an action regression appears, replace it with a previously reviewed full SHA or a newly reviewed fixed release and update the lock, comments and all usages in one commit. Do not roll back to a branch, tag or abbreviated SHA, and do not disable the repository SHA-pinning policy merely to make a workflow run. Preserve failed hosted runs as evidence and require a new green exact-SHA run.

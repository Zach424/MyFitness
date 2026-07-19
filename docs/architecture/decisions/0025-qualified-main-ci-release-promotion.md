# ADR-0025: Qualify release sources against current main and exact hosted CI

Date: 2026-07-20

Status: Accepted

## Context

ADR-0019 binds the service images to one tag, source revision and release workflow, and ADR-0021 applies the same source identity to the client artifacts. The publish workflow also stated that the tagged commit's complete `main` CI had to be green. That statement was not an executable gate: a tag could resolve to another commit, the commit could have left current `main` history, or the only successful Actions run could belong to another revision, branch, event or workflow. The later manifests would still be internally consistent because they only knew the release workflow's local checkout.

Image publication is the first irreversible and externally visible step in the candidate path. Source qualification must therefore finish before registry login, image push or client packaging, while using only read access to hosted repository metadata. Its evidence must survive the short-lived qualification job and remain bound to the immutable GitHub Release.

## Decision

Every candidate workflow creates a strict `myfitness-release-qualification/v1` record before publication. The qualifier uses the GitHub REST API and the workflow's read-only token to prove all of the following:

- the workflow ref is exactly `refs/tags/<v-prefixed-semver>` and the remote tag exists;
- a lightweight tag resolves directly to the workflow commit, or every supported annotated-tag layer dereferences to that exact commit;
- the repository's default branch is the configured `main`, and the tagged commit is either current `main` or an ancestor whose merge base is exactly that commit;
- `.github/workflows/ci.yml` has a completed, successful `push` run on `main` whose `head_sha` is exactly the tagged commit;
- the qualification record binds the repository, version, revision, release workflow run/attempt, tag resolution, branch relation and selected CI run/attempt/URL without unknown fields.

Tag mismatch, unsupported tag targets, diverged history, missing or failed CI, wrong branch/event/workflow/SHA and malformed metadata fail the qualification job. The image and client jobs depend on that job, so registry login, image push and client build cannot start after a failure.

The qualification JSON is uploaded as a same-run artifact. The final release-record job downloads it and performs an offline strict recheck against its own repository, revision, tag and workflow identity before assembling either manifest. The exact JSON is retained in the 90-day workflow bundle and attached as `release-qualification.json` to the non-overwritable GitHub Release. The record is provenance evidence; it contains no credential and does not grant deployment authority.

## Consequences

- The release source requirement is executable rather than an instruction that an operator can accidentally skip.
- A candidate cannot be published from a rewritten tag, a detached or diverged commit, a pull-request-only result or another commit's successful run.
- Lightweight and annotated tags remain supported without weakening the final commit binding.
- GitHub Actions metadata and availability are now part of qualification. A REST failure stops publication rather than guessing.
- The record proves repository state observed during qualification. It does not independently preserve Git objects, validate image provenance, approve the client API address, provision infrastructure or prove owner approval.
- Existing `v0.1.0-rc.1` remains immutable history. The new gate applies only to a future candidate and does not add assets to the historical release.

## Alternatives considered

- Trust the local checkout and `GITHUB_SHA`: rejected because this does not prove the remote tag target, current default-branch ancestry or hosted CI result.
- Require only a successful workflow name: rejected because branch, event and exact `head_sha` are release-critical bindings.
- Publish first and validate inside the final release-record job: rejected because invalid images and tags would already exist in GHCR.
- Put GitHub tokens or API responses into deployment admission: rejected because source qualification belongs to the release control plane and admission must remain non-secret and cloud-neutral.

## Rollback

Before a new candidate consumes this contract, revert the qualifier, workflow wiring and documentation together. Once a GitHub Release contains `release-qualification.json`, preserve it as immutable evidence. Never edit a tag or replace qualification evidence; correct the source on a new commit, wait for its exact successful `main` push CI and publish under a new SemVer tag.

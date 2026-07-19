# ADR-0019: Promote one release through a strict immutable manifest

Date: 2026-07-19

Status: Accepted

## Context

The API, administrator and AI images are built by separate matrix jobs. Docker returns one multi-platform manifest digest per service, but the former workflow left those values only in job output and provenance attestations. A deployer therefore had to copy three digests manually and could accidentally combine images from different commits, tags, workflow attempts or repositories. A mutable version tag was easy to deploy even though the runbook says the digest is the release identity.

The managed-environment gate needs one machine-verifiable input before credentials or traffic are involved. It must remain cloud-neutral, contain no secret or provider configuration, survive beyond an ephemeral workflow log and be usable for both forward deployment and application rollback.

## Decision

Every release is rooted in an existing `v`-prefixed SemVer Git tag. Manual dispatch is allowed only when the selected workflow ref and explicit input name that same tag. Each successful matrix job emits a `myfitness-release-fragment/v1` JSON record containing exactly one service, expected GHCR image name, lowercase `sha256` digest, version, repository, 40-character source revision and workflow run identity.

The release-record job downloads exactly the API, Admin and AI fragments and validates that:

- all three required services appear exactly once;
- every image name belongs to its declared service and repository owner;
- version, source repository, revision, run ID and run attempt are identical;
- every digest is immutable and each final reference is exactly `image@digest`;
- the publication timestamp is canonical ISO-8601 UTC and the schema has no unknown fields.

It then emits `myfitness-release/v1`, its SHA-256 checksum and a redacted verification summary. The bundle is retained as a workflow artifact and attached to a GitHub Release. An existing GitHub Release is never overwritten by a rerun. Per-image GitHub provenance attestations remain required; the release manifest aggregates identities but does not replace provenance verification.

Deployment tooling must consume the three digest-qualified references from a verified manifest. Tags are discovery and human version metadata only. The current and previous accepted manifests form the application rollback pair; database migrations and custody ledgers remain forward-only.

## Consequences

- A three-service release becomes one reviewable, portable control-plane object instead of three copied log values.
- Mixed-commit, missing-service, mutable-version and rewritten-reference errors fail before a managed platform sees them.
- Candidate publication can be proven without granting cloud, DNS, WeChat, OIDC or production-secret authority.
- GitHub Release and Actions retention are repository controls, not an independent long-term release archive. A managed environment must copy accepted manifests to its protected change-record store.
- The first real candidate workflow and unauthenticated or approved-registry pull still require remote evidence; local tests cannot prove GHCR permissions.

## Rollback

Revert the workflow and manifest tool only before a release tag is promoted. Never move or reuse an existing tag and never replace an existing release manifest. If candidate publication fails, fix the source on a new commit and use a new prerelease tag. If a deployed application must roll back, select the complete prior verified manifest and repeat readiness, identity, telemetry and custody checks without reverting migrations or restoring an older database.

# ADR-0021: Bind immutable client delivery artifacts beside the service release

Date: 2026-07-19

Status: Accepted

## Context

`myfitness-release/v1` identifies three deployable OCI images, but H5 and WeApp were still rebuilt from source outside that release record. A source revision alone is insufficient client-delivery evidence: Taro environment variables select the API base and authentication mode, archive tools can add local timestamps and ownership, and an operator could upload a different directory from the one reviewed. The existing `v0.1.0-rc.1` release must remain immutable and cannot be retrofitted with new assets.

The two clients also do not have equal release readiness. WeApp has a production-disabled local fallback removed from its release configuration and uses the WeChat adapter, but still needs a real AppID/domain/device exercise. H5 currently supports only the development identity issuer, which the production API disables. Treating both builds as public candidates would hide an identity boundary.

## Decision

Keep `myfitness-release/v1` unchanged for API, administrator and AI images. Add a sibling `myfitness-client-release/v1` manifest containing exactly H5 and WeApp records. Both records bind:

- the same `v`-prefixed SemVer, repository, full 40-character source revision and workflow run/attempt as the service release;
- one canonical, externally routable HTTPS API base ending exactly in `/v1`;
- platform-specific authentication, delivery class, adapter, archive name, archive SHA-256, byte count, file count, unpacked byte count and deterministic tree SHA-256.

Every tagged client build emits `myfitness-client-build/v1` into its output. H5 must use `dev` authentication and is labelled `preview-only`; WeApp must use `wechat` and is labelled `candidate`. Those are closed schema values, not operator annotations.

Package each output as dependency-free canonical USTAR. Paths are safe, unique and sorted; only regular files are allowed; symlinks fail; mode is `0644`; UID/GID and mtime are zero; padding and headers must reproduce byte-for-byte; and the archive ends in the canonical terminator. Verification hashes the actual TAR, reparses and canonically regenerates it, checks required entrypoints and embedded metadata, and recomputes the tree summary. H5 and WeApp use separate fixed filenames.

The tag workflow gains an input-qualification job before image publication. It requires the repository variable `MYFITNESS_CLIENT_API_BASE_URL` and rejects placeholder/non-routable or non-canonical values before any service image is pushed. Qualified service publication and client packaging may then run in parallel; the final non-overwritable GitHub Release is created only after the service manifest, client manifest, both checksums and both actual TARs verify against one source/workflow identity. Existing tags/releases are never edited.

Upgrade only the output admission schema to `myfitness-deployment-admission/v2`; retain `myfitness-managed-environment/v1`. Admission now requires both manifests/checksums and both actual TARs. It also requires the client API base to equal `<environment.apiOrigin>/v1`. Production rollback requires a complete older service/client pair and client artifact directory.

Client delivery remains separate from service traffic:

1. reverify both exact archives before any upload;
2. keep H5 off public hosting while it is `preview-only` with development identity;
3. upload only the admitted WeApp TAR to a private preview;
4. require real-device identity and data-custody evidence before submission or wider distribution.

## Consequences

- A client can no longer be silently rebuilt with a different API, authentication mode, file tree, timestamp or source after candidate publication.
- Service and client artifacts retain independent schemas and checksums while admission proves they form one release. OCI semantics are not forced onto static/WeChat bundles.
- The next release workflow fails closed until an approved client API address is configured. This is intentional; a plausible invented domain is not release authority.
- The published `v0.1.0-rc.1` remains a valid service-only historical candidate but cannot satisfy admission v2. A new tag is required.
- A successful client manifest does not prove domain ownership, WeChat credentials, real-device login, platform review, H5 production identity, legal filing or public readiness.
- H5 remains visibly incomplete instead of receiving a production label that its current authentication cannot support.
- Bundle-size warnings are unaffected and remain a beta-hardening risk.

## Rollback

Before a new candidate consumes this contract, revert the packager, emitted metadata plugin, workflow, admission v2 and documentation together. Never remove assets from or attach assets to an existing immutable release to simulate rollback. After publication or deployment admission, preserve the complete service/client pair as evidence and issue a new source commit, tag, manifests and admission record for any correction.

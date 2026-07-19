# ADR-0020: Admit managed deployments through a non-secret environment record

Date: 2026-07-19

Status: Accepted

## Context

The immutable `myfitness-release/v1` record proves which API, administrator and AI images form a candidate, but it cannot prove where those images may run. The shared environment also needs an approved account and budget, public origins and edge topology, secret-manager locations, managed data stores, custody owners, telemetry and rollback thresholds. These inputs were listed in the deployment runbook but had no typed boundary, so an operator could skip a control, paste a credential into a change artifact or handwrite a mutable image tag.

The repository must not invent cloud authority, credentials, domains or operational owners on the user's behalf. It can, however, reject an incomplete or unsafe environment dossier before any platform credential is loaded.

## Decision

Managed deployment starts from a strict `myfitness-managed-environment/v1` JSON document. It contains exactly:

- deployment name, stage and protected change-authority reference;
- cloud provider, account reference, region and approved monthly CNY budget;
- distinct canonical HTTPS API, H5 and administrator origins plus TLS, edge and proxy-hop evidence;
- logical `secret://` references for API, administrator, AI, WeChat and OIDC runtime bundles, never secret values;
- service, owner and evidence references for PostgreSQL, Redis, private object storage and the independently retained erasure ledger;
- telemetry, alert, incident-responder and rollback-threshold references;
- AI provider policy, retention, budget and canary-owner references.

Reference schemes are closed by field (`account://`, `change://`, `secret://`, `service://`, `owner://` and `evidence://`). Unknown fields, placeholders, surrounding whitespace, local/test domains, URL credentials, paths, queries and shared public origins fail closed. The committed example deliberately contains placeholders and a zero budget, so it can never become an admission record.

`scripts/deployment-admission.mjs` verifies the environment document, the target release's `sha256sum` transport record and the existing strict release schema. It emits `myfitness-deployment-admission/v1` with the release checksum, exact three digest-qualified images, expected production runtime posture and the ordered migration/private-service/canary sequence.

Rollback is explicit:

- the first `shared-test` deployment may use `no-traffic`, meaning withdraw traffic and scale application services to zero while preserving managed data and migrations;
- all production admissions require a distinct, older, fully verified previous release manifest;
- handwritten image substitutions, `latest`, mixed releases, database rollback and backup restoration are never application rollback mechanisms.

An `admitted` result proves structural completeness and release binding. It does not dereference external records or prove that a named owner approved them. The environment document and output must therefore be created and retained inside the protected change workflow named by `changeAuthorityRef`; the platform approval remains an external deployment gate.

## Consequences

- Cloud selection remains provider-neutral and can be supplied later without changing application code or release identity.
- Secret material no longer needs to appear in repository files, command output or deployment records.
- The real `v0.1.0-rc.1` candidate can be bound to one ordered plan before a cloud credential is granted.
- A syntactically valid but dishonest reference is still possible outside a protected change system. Approval, evidence dereferencing and platform IAM remain necessary and must not be inferred from local tests.
- The admission record plans deployment; it does not provision infrastructure, configure DNS, validate a real WeChat device or open traffic.
- The current release input covers the API, administrator and AI service plane only. H5 and WeApp build outputs need their own deterministic checksums/source binding and admission integration before client delivery can use this gate.

## Rollback

Before any managed deployment consumes the schema, revert the tool, package command, example and documentation together. After an admission record is attached to a real change, preserve it as evidence and issue a new record for corrections. Do not edit an accepted record or replace either release manifest it references.

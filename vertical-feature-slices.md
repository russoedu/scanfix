# ADR: Vertical feature slices and API path naming

- **Status:** Accepted and implemented
- **Date:** 2026-09-07
- **Scope:** Hand-authored source under `apps/api`
- **Intended adoption path:** `docs/architecture/vertical-feature-slices.md`

## Context

Before this decision, the API grouped a capability first and then separated most of its code into broad technical folders such as `handlers`, `application`, `domain`, and `contracts`. The layering rules in [ARCHITECTURE.md](../../ARCHITECTURE.md) remain valuable, but large capabilities had become difficult to navigate and their technical folders obscured which files changed together.

The lifecycle was split across three feature folders:

- `ocfLifecycle`: 15 files concerned with ticket creation, ticket lookup, agreement retrieval, and a dormant status queue path.
- `signatureLifecycle`: 40 files concerned with Jira decisions, e-signature creation, multi-signature, Adobe Sign events, and ticket transitions.
- `licenseActivation`: eight files. Despite its name, it processes the incoming CRM callback and updates Jira and SharePoint.

That split did not match the end-to-end business capability. In particular, `ocfLifecycle/application/updateStatus.ts` deep-imported `signatureLifecycle/application/transitionTicketForStage.ts`. This bypassed the feature public API and demonstrated that ticket transition policy was shared lifecycle behaviour, not an internal detail of signature processing.

The migration review found two questionable entry paths:

- `updateStatusQueueHandler` was neither exported nor registered, so its queue chain was removed.
- `updateAgreementStageHandler` was registered as `UPDATE_STAGE` and marked `Still not used`, but [the web app has a live caller](../../apps/app/src/_api/api.ts), so the endpoint and its handler were preserved.

The repository also contained mixed camelCase, PascalCase, and kebab-case API source paths. Case-sensitive build agents and path-based tooling made this inconsistency costly.

## Decision

The API adopts **capability -> cohesive subfeature -> flat role-suffixed files** as its default organisation.

This combines Vertical Slice Architecture with selected Clean/Hexagonal Architecture and Domain-Driven Design vocabulary. These influences guide boundaries and names; no framework mandates the suffixes in this ADR.

The first application is a `quote-agreement-lifecycle` capability with these final subfeatures:

1. `ticket-creation`
2. `agreement-retrieval`
3. `ticket-stage-query`
4. `jira-transition-events`
5. `e-signature-creation`
6. `multi-signature`
7. `adobe-sign-events`
8. `ticket-transition`
9. `crm-update`

The complete migration is specified in [the lifecycle refactoring plan](../plans/quote-agreement-lifecycle-refactoring.md).

All new and renamed hand-authored paths under `apps/api` use kebab-case. The lifecycle migration and all future or semantically touched files use the role suffixes below. Unrelated existing files are not semantically renamed in bulk, although their paths are converted to kebab-case.

## Implementation

The decision is implemented:

- All hand-authored files and directories under `apps/api/src` use kebab-case.
- Active code from `ocfLifecycle`, `signatureLifecycle`, and `licenseActivation` now lives in the nine `quote-agreement-lifecycle` subfeatures. The old feature directories and aliases were removed.
- TypeScript and Jest resolve `@quote-agreement-lifecycle` to the capability root. [Azure Function registrations](../../apps/api/src/functions.ts) import every lifecycle handler through that public API.
- The unregistered status queue chain was removed.
- `UPDATE_STAGE` was retained because [the web app calls it](../../apps/app/src/_api/api.ts) when a customer opens or submits the multi-signature flow. Its implementation is in `multi-signature/update-agreement-stage.handler.ts`.
- The unused feature-local `validateClientCert` implementation was deleted. Active Adobe Sign client-ID and certificate validation remains in [shared middleware](../../apps/api/src/shared/middleware/with-client-cert.middleware.ts).
- Unknown Jira statuses deliberately return `{ noData: 'this transition is unmanaged' }`; they are not treated as errors.

### API-wide adoption

The same structure now covers the remaining API capabilities:

- `legal-terms` became `terms-and-conditions`, and `translator-access` became
  `translator-accounts` without changing their external endpoint values.
- `operations` is split into `cache-refresh` and `first-access-cleanup` outcomes.
- `spreadsheet-parsing` is split into `quote-parsing` and `recipe-management`.
  Recipe levels, spreadsheet versions, publication eligibility, sequencing, and
  refresh decisions are parser-owned. SharePoint clients implement only the external
  list, attachment, upload, and refresh protocols.
- `system-details` is split into `application-information`, `crm-version`, and
  `payment-term-exceptions` outcomes. Application information obtains supported
  spreadsheet versions through the parser capability's public query.
- Integration and shared files use role suffixes such as `.client.ts`, `.contract.ts`,
  `.repository.ts`, `.mapper.ts`, `.config.ts`, `.service.ts`, and `.enum.ts`.
- CRM status vocabulary belongs to `integrations/crm`; it is no longer a shared root
  type.
- Microsoft Teams notification I/O and configuration belong to
  `integrations/ms-teams`. Shared HTTP response handling delegates notification
  delivery to that client.

Azure Function registrations continue to import handlers through capability barrels.
Routes, methods, authentication wrappers, queue names, and public handler symbols are
unchanged by this structural migration.

## Influences

| Influence | Adopted idea | Not adopted |
|---|---|---|
| Vertical Slice Architecture | Files that deliver one user or system outcome stay together. | A framework-specific mediator or request pipeline. |
| Clean/Hexagonal Architecture | Business decisions remain independent of transports and vendor SDKs. | Mandatory concentric folder layers inside every slice. |
| Domain-Driven Design | Names reflect business capabilities, models, policies, and boundaries. | Tactical patterns where plain functions and types are sufficient. |
| Existing API architecture | Handlers decode transport; integrations own external protocols; dependency direction remains inward. | Technical-layer folders as the primary navigation structure. |

## Definitions

- **Capability:** A durable business responsibility recognisable outside the codebase, such as quote-agreement lifecycle.
- **Subfeature:** A cohesive outcome or stage within a capability that can expose a small public API.
- **Entry-point handler:** A transport adapter registered by Azure Functions. It decodes a request or message, invokes one use case, and shapes the response.
- **Use case:** An operation that coordinates a business process and its integration calls.
- **Model:** A business concept with meaning, state, or invariants that remains useful without external systems.
- **Contract:** Data exchanged across a boundary, such as an HTTP body, queue message, webhook payload, or explicit input/output shape.
- **Repository:** A business-oriented interface to stored domain information. It hides persistence details.
- **Client:** An adapter for an external protocol or vendor API.
- **Mapper:** A deterministic conversion between representations without orchestration or I/O.
- **Policy:** A reusable business decision, including whether an action is permitted or required.
- **Validator:** A focused check that accepts or rejects data and reports why.

## Suffix glossary

| Suffix | Responsibility | Example |
|---|---|---|
| `.handler.ts` | Adapts HTTP, queue, timer, or webhook transport. | `create-ticket.handler.ts` |
| `.use-case.ts` | Coordinates one business operation. | `create-ticket.use-case.ts` |
| `.model.ts` | Holds a business concept or invariants. | `adobe-sign-webhook.model.ts` |
| `.contract.ts` | Defines data crossing a boundary. | `crm-webhook.contract.ts` |
| `.repository.ts` | Exposes business-oriented persistence access. | `agreement.repository.ts` |
| `.client.ts` | Implements an external protocol. | `adobe-sign.client.ts` |
| `.mapper.ts` | Converts one representation to another. | `jira-ticket-key.mapper.ts` |
| `.policy.ts` | Makes a reusable business decision. | `agreement-match.policy.ts` |
| `.validator.ts` | Validates focused input or identity. | `customer-signers.validator.ts` |
| `.config.ts` | Declares configuration owned by one module. | `share-point.config.ts` |
| `.enum.ts` | Declares a technical enumeration. | `http-status.enum.ts` |
| `.test.ts` | Tests the matching production basename. | `create-ticket.use-case.test.ts` |

Test qualifiers may precede `.test.ts`, for example `quote-model.parser.test.ts`. The production basename must otherwise be preserved.

## Naming rules

- Use verb phrases for handlers and operations: `process-crm-update.handler.ts`, `process-crm-confirmation.use-case.ts`.
- Use nouns for concepts: `crm-update.model.ts`, `jira-transition-event.contract.ts`.
- Keep TypeScript symbols in their language conventions: exported classes and types remain PascalCase; functions and variables remain camelCase.
- Do not use `helper`, `util`, `manager`, `processor`, or `data` as a role. Use `service` only for cohesive cross-cutting behaviour that cannot accurately use a more specific role. An approved exception must explain the responsibility.
- Do not create local `shared`, `common`, `helpers`, or `utils` folders. Shared behaviour belongs in a named subfeature or an established repository-wide module with a single responsibility.

Good:

```text
quote-agreement-lifecycle/ticket-transition/transition-ticket-for-status.use-case.ts
quote-agreement-lifecycle/multi-signature/customer-signers.validator.ts
quote-agreement-lifecycle/crm-update/process-crm-confirmation.use-case.ts
```

Avoid:

```text
quote-agreement-lifecycle/shared/status-helper.ts
quote-agreement-lifecycle/common/crm-utils.ts
quote-agreement-lifecycle/services/signature-manager.ts
```

## Models and contracts

A model owns business meaning or invariants. It must not accept vendor wire shapes directly or perform I/O. A contract exists because two components exchange data. A TypeScript interface is not automatically a contract.

For Adobe Sign, the raw webhook payload is a contract. A model may derive the participant and lifecycle state used by the business process. Mapping between them is explicit and remains inside the owning slice.

For internal calls, prefer a named input type beside the use case when it has no independent boundary meaning. Do not move every type into a `.contract.ts` file.

## Repositories and clients

A repository expresses storage in business terms, for example `findAgreementByTicket`. A client expresses an external protocol, for example `transition`, `comment`, or `send`.

The existing repository-wide Jira, SharePoint, Adobe Sign, CRM, email, and queue clients remain under `apps/api/src/integrations`. A lifecycle slice calls those clients; it does not wrap each client in a local repository solely to satisfy a pattern. A repository is introduced only when the capability needs a stable business-oriented persistence abstraction.

## Boundaries and public APIs

Each subfeature has an `index.ts` that defines its deliberate public API.

- Sibling subfeatures import only from the target sibling's `index.ts`.
- Sibling deep imports are forbidden, including `../other-slice/file` and alias paths into internal files.
- Internal files use relative imports and do not import through their own barrel.
- The capability root `index.ts` exports Azure Function handlers and only intentionally reusable capability APIs.
- Tests are never exported.
- Non-handler exports include a short comment naming the consuming slice.
- `functions.ts` imports active lifecycle handlers from the capability root barrel.
- Repository-wide `shared`, `integrations`, and configuration code never imports from the capability.

`ticket-transition` owns lifecycle-wide Jira transition behaviour. It is a named business subfeature, not a generic sharing folder.

## Folder threshold

A subfeature is flat by default. Reaching **12 hand-authored production files** is a review trigger, not permission to recreate technical layers. A nested folder is allowed only when both conditions hold:

1. the slice contains at least two independently cohesive groups that are difficult to scan as one list; and
2. an ADR amendment or documented exception names the groups, dependency direction, and public API impact.

Tests do not count towards the threshold. `handlers`, `application`, `domain`, and `contracts` must not be introduced as automatic subfolders.

## Target shape

```text
apps/api/src/features/quote-agreement-lifecycle/
  index.ts
  ticket-creation/
    index.ts
    create-ticket.handler.ts
    create-ticket.use-case.ts
    build-ticket-upload-data.use-case.ts
  agreement-retrieval/
    index.ts
    get-agreement.handler.ts
    get-agreement.use-case.ts
  ticket-stage-query/
    index.ts
    get-ticket-stage.handler.ts
    get-ticket-stage.use-case.ts
  jira-transition-events/
    index.ts
    process-jira-transition.handler.ts
    process-jira-transition.use-case.ts
  e-signature-creation/
    index.ts
    create-adobe-sign-agreement.use-case.ts
  multi-signature/
    index.ts
    update-agreement-stage.handler.ts
  adobe-sign-events/
    index.ts
  ticket-transition/
    index.ts
    transition-ticket-for-status.use-case.ts
  crm-update/
    index.ts
    process-crm-update.handler.ts
    process-crm-confirmation.use-case.ts
```

No capability README is added. This ADR and the migration plan are the source of truth for structure and migration.

## Representative placements

| Current responsibility | Placement | Reason |
|---|---|---|
| Create and update a Jira ticket from a submitted quote | `ticket-creation` | One ticket creation outcome. |
| Query a ticket's current workflow stage | `ticket-stage-query` | Independent read operation and endpoint. |
| Dispatch account-manager Jira decisions | `jira-transition-events` | Jira event-driven lifecycle coordination. |
| Build and send an Adobe agreement | `e-signature-creation` | Agreement creation is consumed by Jira event processing. |
| Receive and process Adobe webhooks and queue messages | `adobe-sign-events` | One asynchronous ingress and processing flow. |
| Decide whether a status moves a Jira ticket | `ticket-transition` | Named policy reused by lifecycle slices. |
| Receive CRM completion callbacks | `crm-update` | The existing `licenseActivation` code is CRM callback processing. |
| Validate Adobe client ID and mTLS certificate | shared middleware | Transport security is not lifecycle business behaviour. |

## Path casing and exceptions

All hand-authored directories and files under `apps/api` use kebab-case, including files that contain exported classes.

Explicit exceptions are:

- `index.ts`, `README.md`, and `TODO.md`;
- `package.json`, `project.json`, `host.json`, `local.settings*.json`, and `tsconfig*.json`;
- tool-mandated Jest, ESLint, Vite, Azure, lockfile, certificate, and similar ecosystem names;
- generated or third-party trees including `coverage`, `dist`, `doc`, `documentation`, and `node_modules`.

Exceptions apply to names mandated by tools, not arbitrary legacy spellings. New exceptions require a documented reason and owner.

## Enforcement

1. Extend ESLint boundaries for suffix roles without weakening the existing handler, domain, integration, and lower-layer restrictions.
2. Reject sibling deep imports and permit sibling access only through `index.ts`.
3. Add a path check for hand-authored `apps/api` files and directories, with the explicit exceptions above and a temporary migration allowlist where required.
4. Keep `madge --circular` at zero cycles.
5. Review root and subfeature barrels for accidental exports.
6. Update `LogProperties.file`, tests, mocks, aliases, generated-document inputs, and documentation links whenever a path moves.

## Placement decision tree

```text
Does it receive HTTP, queue, timer, or webhook input?
  yes -> *.handler.ts
  no  -> Does it coordinate a business outcome or I/O?
           yes -> *.use-case.ts
           no  -> Does it make a reusable business decision?
                    yes -> *.policy.ts
                    no  -> Does it hold business meaning or invariants?
                             yes -> *.model.ts
                             no  -> Does data cross a boundary?
                                      yes -> *.contract.ts
                                      no  -> Does it convert representations?
                                               yes -> *.mapper.ts
                                               no  -> Does it validate focused input?
                                                        yes -> *.validator.ts
                                                        no  -> Is it business-oriented persistence?
                                                                 yes -> *.repository.ts
                                                                 no  -> Is it an external protocol adapter?
                                                                          yes -> integration *.client.ts
                                                                          no  -> revisit the responsibility; do not create a generic bucket
```

Place the file in the subfeature whose outcome would fail if the file disappeared. If several siblings need it, first test whether it represents a named subfeature. Promote it to repository-wide `shared` only when it is genuinely cross-capability and depends on no feature.

## Consequences

### Benefits

- Files that change together are colocated.
- Public subfeature APIs make sibling dependencies visible.
- Role suffixes retain architectural meaning without technical-layer folders.
- The lifecycle owns its complete Jira, signature, Adobe event, and CRM callback flow.
- Kebab-case removes case-sensitive path ambiguity.

### Costs and trade-offs

- The migration touched imports, aliases, mocks, logging metadata, and documentation.
- Flat folders require disciplined names and small public barrels.
- Existing ESLint globs based on layer directories must become suffix-aware.
- A file may move again when its responsibility is clarified; role names must follow behaviour rather than history.

## Non-goals

- Changing endpoint routes, methods, authentication, queue names, payloads, status mappings, or integration side effects.
- Renaming exported TypeScript symbols as part of path migration.
- Splitting the large Adobe webhook model or processor.
- Consolidating CRM ticket closure with general ticket transition solely because both inspect `movesTicket`.
- Retrofitting semantic suffixes to every unrelated API file in one change.
- Introducing a new framework, mediator, dependency-injection container, or capability README.
- Fixing the existing anonymous CRM callback authentication; that requires a separate security decision.

## PR checklist

- [ ] The path is kebab-case or matches an explicit exception.
- [ ] The filename role matches its actual responsibility.
- [ ] The file is in the slice whose outcome it serves.
- [ ] Handlers only decode, invoke, and shape transport responses.
- [ ] Models and policies contain no I/O or vendor payload dependency.
- [ ] External protocols remain behind integration clients.
- [ ] Sibling imports use the target subfeature `index.ts`.
- [ ] The capability root exports only active handlers and intentional public APIs.
- [ ] Tests retain the production basename and move with behaviour.
- [ ] Alias, mock, log-path, documentation, and generated-input references are updated.
- [ ] Typecheck/build, focused tests, lint, and cycle checks pass or pre-existing failures are recorded.

## Exception process

An exception must be recorded in this ADR or a linked ADR before merge. It must state the affected path, the rule being waived, the tool or design constraint that requires it, its owner, and whether it is temporary. Temporary exceptions include a removal condition and target phase. Convenience and legacy compatibility are not sufficient reasons for permanent forwarding barrels or deep imports.

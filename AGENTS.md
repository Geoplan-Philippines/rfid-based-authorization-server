# Agent Development Guide

## Goal

Keep every module readable enough for client technical review. Prefer small, explicit NestJS files that look like one engineer wrote the system.

## Module Shape

Use `src/modules/trucks` as the reference structure for registry-style modules:

- `*.controller.ts` wires routes, guards, DTOs, and authenticated user context only.
- `*.service.ts` owns use-case flow, transactions, validation, and cross-service coordination.
- `*.mapper.ts` converts Prisma payloads into response contracts. Keep one mapper file at module root; create a `mappers/` folder only when the module has multiple mapper files.
- `constants/*.constants.ts` stores audit action strings, Prisma include/select objects, and other reusable module constants.
- `types/*.types.ts` exports response contracts and Prisma payload types.
- `dto/*.dto.ts` validates inbound request bodies and query strings.

Do not introduce a repository layer unless it removes real duplication across multiple services.

## Controllers

Keep controllers thin. Method names must include the entity and match the service method name, for example `createTruck`, `getAllTrucks`, `archiveTruck`.

Use explicit `Promise<T>` return types. Use `body` for `@Body()` parameters because the DTO already names the shape.

Route comments are optional. Add a short comment only when the route intent is not obvious from the method name. Do not add large banner comments above every endpoint.

## Services

Services should read as workflows:

1. Validate and normalize input.
2. Read or write through Prisma.
3. Record audit logs inside the same transaction when data changes.
4. Return mapped response contracts.

Extract response mapping to a mapper when a method builds nested response objects. Extract Prisma include/select objects to constants when they are reused or define response payload shape.

Private helpers should use action names, not generic names: `ensureTruckExists`, `buildListWhere`, `recordTruckAuditLog`.

## Imports And Formatting

Keep imports grouped by source:

1. NestJS and third-party packages.
2. `src/...` shared project imports.
3. Relative module imports.

Single-line imports are acceptable when readable on a normal development monitor. Do not manually split imports just to satisfy a narrow width unless the line becomes hard to scan.

## DTOs And Validation

Keep DTOs small and focused. Validate at the DTO boundary, normalize in the service when normalization is domain behavior, for example uppercasing plate numbers.

For update DTOs that match the create DTO fields, use `@nestjs/mapped-types` and `PartialType(CreateEntityDTO)` instead of repeating validators. Keep custom update-command DTOs explicit when they do not represent a partial create shape.

## Comments

Prefer self-documenting names over comments. Use comments only for non-obvious business rules, integration constraints, or security-sensitive decisions.

Remove stale TODOs before turnover. If a TODO must remain, include the owner or decision needed.

## Tests

At minimum, each cleaned module should have tests that prove:

- The controller delegates actor-sensitive calls correctly.
- The service normalizes input before persistence.
- List/detail responses map nested Prisma payloads correctly.
- Audit logs are written for mutating operations.

Keep tests focused on behavior, not implementation noise.

## Suggested Libraries

- `prettier`: standardizes formatting so reviews focus on behavior.
- `eslint-plugin-simple-import-sort`: keeps import ordering consistent without manual cleanup.
- `@nestjs/mapped-types`: reduces duplicated create/update DTO code.
- `nestjs-pino`: adds structured request logging for production support.
- `@nestjs/swagger`: generates API docs when endpoint documentation becomes a client handoff requirement.

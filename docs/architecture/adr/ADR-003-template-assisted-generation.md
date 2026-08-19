# ADR-003: Use template-assisted AI generation

Status: Accepted  
Date: 2026-08-15

## Context

ForgeWeb must generate secure, testable full-stack applications while still adapting to user requirements. Generating every file from an unconstrained blank slate increases variability, token cost, repair loops, and the chance of insecure or internally inconsistent architecture. Rigid templates alone cannot satisfy meaningful product differences.

## Decision

Use versioned, ForgeWeb-owned application templates as secure architectural skeletons. AI plans and applies typed transformations to customize the selected template against the approved specification.

Templates define:

- supported stack versions;
- authentication and authorization integration points;
- project layout and architectural boundaries;
- database migration conventions;
- validation, logging, and error-handling primitives;
- test harnesses and security tooling;
- generation markers and manifest hooks.

The AI may add or modify modules through the generation plan, but release validation must reject unsupported dependency, boundary, or security changes unless an approved policy explicitly allows them.

## Consequences

Positive:

- more deterministic builds and validation;
- stronger secure defaults;
- smaller and more explainable change sets;
- easier fixture testing and graph verification;
- lower generation and repair cost.

Negative:

- templates require ongoing maintenance and migrations;
- early stack choice constrains the MVP;
- exceptional applications may require an advanced path later.


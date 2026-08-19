# ADR-004: Keep third-party showcase components in the platform UI

Status: Accepted  
Date: 2026-08-15

## Context

ForgeWeb should feel modern and memorable. Motion UI/Motion AI resources and React Bits provide useful inspiration and implementation components, but their licensing and redistribution conditions differ from a normal internal dependency. ForgeWeb also exports generated applications to customers, making the redistribution boundary important.

## Decision

Use appropriately licensed Motion UI and React Bits components in the ForgeWeb platform interface only. Generated customer applications will use ForgeWeb-owned components and templates unless a separate component has been individually reviewed and approved for redistribution.

The design system will use motion to communicate state and hierarchy, especially for:

- specification progress;
- generation timelines;
- graph traversal and impact highlighting;
- validation status changes;
- editor-to-preview transitions.

All effects must support reduced motion, keyboard operation, responsive layouts, and performance budgets. Decorative animation must not obscure security results, failures, approvals, or other consequential states.

## Consequences

Positive:

- a polished platform experience without contaminating generated exports;
- a clear licensing and provenance boundary;
- customer applications remain maintainable and ForgeWeb-controlled;
- accessibility and performance remain explicit acceptance criteria.

Negative:

- some visual components must be reimplemented for generated apps;
- designers and engineers must track component provenance;
- platform UI upgrades require license review when usage changes.

## Review trigger

Revisit this decision only after legal/license review confirms that a specific library and distribution model permit inclusion in customer exports.


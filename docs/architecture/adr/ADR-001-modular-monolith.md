# ADR-001: Begin with a modular monolith

Status: Accepted  
Date: 2026-08-15

## Context

ForgeWeb needs identity, projects, specification approval, generation orchestration, validation, graph traceability, editor APIs, and export. These capabilities have different responsibilities but share transactions, authorization rules, and an early-stage product model that will evolve quickly.

Starting with independently deployed microservices would add distributed tracing, service authentication, versioned network contracts, failure coordination, and operational overhead before usage proves those boundaries necessary.

## Decision

Build the control plane as a TypeScript modular monolith with explicit internal modules and dependency rules. Run untrusted generation, validation, and Code Review Graph work in isolated workers because those require a real security and resource boundary.

The initial deployable units are:

- web application;
- control-plane API and job producer;
- trusted job workers;
- isolated sandbox runners;
- isolated Code Review Graph runners.

Internal modules may communicate through typed application interfaces and persisted domain events. They must not reach into another module's private database access layer.

## Consequences

Positive:

- simpler development, testing, deployment, and transactions;
- faster evolution of cross-cutting product workflows;
- clear security separation where it matters most;
- modules can be extracted later using observed load and ownership evidence.

Negative:

- the control plane scales as a larger unit at first;
- poor discipline could create internal coupling;
- resource-intensive work must never leak back into the API process.

## Extraction signals

Extract a module only when at least one is true:

- it needs independent scaling that materially reduces cost or latency;
- it has a distinct security or availability boundary;
- it is owned and released independently;
- its workload or persistence model disrupts the control plane;
- operational evidence shows the modular monolith is the constraint.


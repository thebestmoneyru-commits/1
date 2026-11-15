# PROMPTGPT ∞ Style DNA Transfer Engine — v2 foundation

This directory is an isolated modernization track. Existing application files are not modified.

## Current status

Foundation phase: shared contracts and the first deterministic semantic-preservation gate.

Implemented:
- shared TypeScript contracts in `types.ts`;
- literal anchor inventory in `semantic/factInventory.ts`;
- structured proposition assessment validation in `semantic/propositionIntegrity.ts`;
- combined semantic gate in `semantic/semanticPreservation.ts`.

Not yet implemented:
- proposition extraction from natural language;
- independent model-backed semantic verification;
- authorial style analysis and scoring;
- candidate generation, critic, repair and orchestration;
- hardened model routing and API integration;
- automated test suite and build configuration.

## Important design boundary

Literal anchor matching is deliberately not presented as semantic understanding. It can protect numbers, explicitly supplied names and terms, scripture references, and quoted spans. It cannot establish that negation scope, modality, qualifications, or logical relations survived.

Those higher-level checks require structured propositions and independent assessments tied to the immutable original source. A model-generated assessment is evidence for review, not infallible proof; critical workflows should use a second pass or human review.

## Integration rule

Do not connect this directory to the production API until:
1. the semantic extractor and verifier have tests;
2. all required propositions are accounted for;
3. candidate admission is based on the immutable original source;
4. the frontend response contracts are preserved;
5. server and frontend builds are checked separately.

The existing application remains untouched during this foundation phase.

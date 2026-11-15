# PROMPTGPT ∞ Style DNA Transfer Engine — v2 foundation

This directory is an isolated modernization track. Existing application files are not modified.

## Current status

Foundation phase: semantic-preservation contracts and the first Style DNA analyzer.

Implemented:
- shared TypeScript contracts in `types.ts`;
- literal anchor inventory in `semantic/factInventory.ts`;
- source-span validation for extracted propositions in `semantic/propositionSchema.ts`;
- canonical source inventory assembly in `semantic/buildInventory.ts`;
- structured proposition assessment validation in `semantic/propositionIntegrity.ts`;
- combined semantic gate in `semantic/semanticPreservation.ts`.

Not yet implemented:
- proposition extraction from natural language;
- independent model-backed semantic verification;
- weighted style scoring against a donor baseline;
- candidate generation, critic, repair and orchestration;
- hardened model routing and API integration;
- automated test suite and build configuration.

## Style analyzer limitations\n\nThe analyzer records measurable signals and source excerpts, but does not claim full grammatical parsing. Russian participle/gerund detection uses approximate suffix heuristics and can produce false positives or miss forms. Sentence segmentation handles common abbreviations but still needs broader corpus-based testing. Short samples are explicitly marked limited or insufficient; their apparent frequent patterns must not be treated as stable authorial traits.\n\nThe regression checks can be invoked from the repository root with a TypeScript runner by importing `runStyleDNAAnalyzerSelfTests` from `promptgpt-v2/style/styleDNAAnalyzer.test.ts`. They have been added but have not yet been executed in this environment.\n\n## Important design boundary

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

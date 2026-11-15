# PROMPTGPT ∞ Style DNA Transfer Engine — v2 foundation

This directory is an isolated modernization track. Existing production files are not modified.

## Implemented

### Semantic Preservation Layer
- Shared contracts in `types.ts`.
- Literal anchor inventory in `semantic/factInventory.ts`.
- Source-span validation for extracted propositions in `semantic/propositionSchema.ts`.
- Canonical source inventory assembly in `semantic/buildInventory.ts`.
- Structured proposition assessment validation in `semantic/propositionIntegrity.ts`.
- Combined semantic gate in `semantic/semanticPreservation.ts`.

### Style DNA Analyzer
- Style profile contracts in `style/styleTypes.ts`.
- Russian-aware paragraph and sentence segmentation in `style/tokenizer.ts`.
- Heuristic corpus analysis in `style/styleDNAAnalyzer.ts`.
- Public exports in `style/index.ts`.
- Dependency-free regression checks in `style/styleDNAAnalyzer.test.ts`.

## Style analyzer limitations

The analyzer records measurable signals and source excerpts, but does not claim full grammatical parsing. Russian participle and gerund detection uses approximate suffix heuristics and can produce false positives or miss forms. Sentence segmentation handles common abbreviations and personal initials, but still needs broader corpus-based testing.

Short samples are explicitly marked limited or insufficient. Their apparent frequent patterns must not be treated as stable authorial traits. The current analyzer is a feature extractor, not yet a complete author-style fingerprint or a similarity score.

The regression checks can be invoked from the repository root with a TypeScript runner by importing `runStyleDNAAnalyzerSelfTests` from `promptgpt-v2/style/styleDNAAnalyzer.test.ts`. They have been added but have not yet been executed in this environment.

## Not yet implemented

- Natural-language proposition extraction and independent model-backed semantic verification.
- Weighted style scoring against an immutable donor baseline.
- Candidate generation, critic, repair and repair verification.
- Hardened model routing and API integration.
- Full automated test suite and build configuration.

## Important design boundaries

Literal anchor matching is not semantic understanding. It can protect numbers, explicitly supplied names and terms, scripture references, and quoted spans. It cannot establish that negation scope, modality, qualifications, or logical relations survived.

Those higher-level checks require structured propositions and independent assessments tied to the immutable original source. A model-generated assessment is evidence for review, not infallible proof; critical workflows should use a second pass or human review.

Style features are measurements, not instructions to mechanically insert frequent words or constructions. The next scoring layer must compare feature distributions and contexts against the donor corpus, account for sample size, and penalize unsupported overfitting.

## Integration rule

Do not connect this directory to the production API until:
1. the semantic extractor and verifier have tests;
2. all required propositions are accounted for;
3. the style scorer uses a fixed donor baseline and confidence-aware comparisons;
4. candidate admission is based on the immutable original source;
5. frontend response contracts are preserved;
6. server and frontend builds are checked separately.

The existing application remains untouched during this foundation phase.

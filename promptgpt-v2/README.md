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
- Confidence-aware Style DNA scoring in `style/styleDNAScorer.ts`.
- Frozen donor baseline creation and integrity checks in `style/donorBaseline.ts`.
- Semantic-first candidate admission in `style/candidateEvaluator.ts`.
- Bounded parallel candidate generation from the immutable source and donor baseline in `style/candidateGenerator.ts`.
- Evidence-grounded style criticism with exact candidate spans and donor-example validation in `critic/styleCritic.ts`.
- Exact-span surgical repairs constrained by critic findings in `repair/surgicalRepair.ts`.
- Mandatory post-repair semantic and style re-evaluation in `repair/repairVerification.ts`.
- One-cycle critic → repair → independent verification orchestration in `repair/criticRepairPipeline.ts`.
- Public module entry points in `index.ts`, `critic/index.ts` and `repair/index.ts`.
- Public exports in `style/index.ts`.
- Analyzer, scorer, baseline, candidate-generation, candidate-gate, critic, surgical-repair, repair-verification and orchestration regression checks in their corresponding `*.test.ts` files.

## Style analyzer limitations

The analyzer records measurable signals and source excerpts, but does not claim full grammatical parsing. Russian participle and gerund detection uses approximate suffix heuristics and can produce false positives or miss forms. Sentence segmentation handles common abbreviations and personal initials, but still needs broader corpus-based testing.

Short samples are explicitly marked limited or insufficient. Their apparent frequent patterns must not be treated as stable authorial traits. The current analyzer is a feature extractor, not a complete author-style fingerprint. The scorer compares measured feature rates and distributions against the donor profile, uses family weights and confidence discounts, and explicitly refuses to score insufficient or version-incompatible profiles. Candidate-only repeated markers are treated as possible overfitting rather than automatic style matches.

The score is a heuristic similarity estimate, not a calibrated probability that a human reader will identify the author. The original donor profile is deep-cloned and recursively frozen before it becomes a baseline. An integrity checksum detects accidental profile substitution or mutation; it is not a cryptographic signature.

Candidate generation uses an injected model adapter, creates independent variants from the same immutable source, limits concurrency, isolates per-candidate provider failures, and binds each result to source and donor-baseline fingerprints. Source text, donor examples, anchors and extracted propositions are serialized as JSON data and explicitly treated as data rather than instructions.

Candidate admission applies the semantic gate first. A style score cannot compensate for missing facts or failed proposition checks. Candidates with inadequate style evidence are marked for review, not silently admitted or assigned a fabricated numeric score. The initial style threshold (70/100) is an engineering default, not an empirically validated cutoff; it must be calibrated against a labeled evaluation corpus before production use. The critic requires every actionable finding to cite an exact candidate span and an excerpt present in the frozen donor evidence. The repair engine accepts only exact replacements for those spans, rejects stale or overlapping patches, and never applies an unverified full-text rewrite. A successful patch is not considered successful work until an independent semantic assessment and a fresh style profile pass the candidate gate. It compares sentence-length buckets, mean and median sentence length, punctuation rates, syntactic and connector rates, repeated openings/closings, lexical repetitions, and paragraph rhythm where the analyzer has enough evidence. Rare markers and lexical repeats have reduced weight. Corpus-wide features with zero observed occurrences remain part of the comparison, so the scorer can detect candidate overuse of traits absent from the donor sample.

The dependency-free regression checks can be invoked from the repository root with a TypeScript runner by importing the exported `run*SelfTests` functions from the corresponding `*.test.ts` files. They have been added but have not yet been executed in this environment.

## Not yet implemented

- Natural-language proposition extraction and independent model-backed semantic verification.
- Full author-style parsing, including reliable Russian morphology and clause structure.
- Full automated test suite and build configuration.
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

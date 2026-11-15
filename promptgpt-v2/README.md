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
- Task-aware model routing with per-model concurrency and queue limits, bounded retries, cooldowns and fallback policy in `infrastructure/modelRouter.ts`.
- Google GenAI SDK adapter with per-model capability filtering, validated sampling ranges and SDK AbortSignal propagation in `infrastructure/geminiAdapter.ts`.
- Version-aware bounded TTL/LRU caching in `infrastructure/versionedCache.ts`.
- Runtime JSON parsing and schema-validator hooks in `infrastructure/jsonValidation.ts`.
- HTTPS origin allowlisting for remote service endpoints in `infrastructure/remoteEndpointPolicy.ts`.
- DNS-pinned HTTPS POST transport with IPv4/IPv6 special-range filtering, no redirects, request timeouts and streaming response-size limits in `infrastructure/safeRemoteFetch.ts`.
- Public module entry points in `index.ts`, `critic/index.ts`, `repair/index.ts` and `infrastructure/index.ts`.
- Public exports in `style/index.ts`.
- Analyzer, scorer, baseline, candidate-generation, candidate-gate, critic, surgical-repair, repair-verification, orchestration, model-router, Gemini-adapter, cache, JSON-validation, remote-endpoint-policy and safe-remote-fetch regression checks in their corresponding `*.test.ts` files.

### Application Orchestration
- Explicit deployment-supplied model allowlist and task-route validation in `application/modelCatalog.ts`; no default model IDs are assumed.
- Shared-router adapters for candidate generation, style critique, surgical repair and independent proposition verification in `application/routerAdapters.ts`.
- End-to-end service orchestration in `application/styleTransferService.ts`: immutable source/baseline binding, bounded candidate generation, semantic-first admission, one critic/repair cycle, and final selection with trace metadata.
- A Gemini composition root in `application/createGeminiService.ts` constructs one SDK client and one shared router for the lifetime of the service instance; initialize it at server startup, not per request.
- Application contracts in `application/applicationTypes.ts`. The service receives a prebuilt, source-bound semantic inventory and frozen donor baseline; it does not invent or silently extract either one.

## Running the v2 regression checks

The complete offline regression suite (it does not call the live Gemini API) is collected in `runSelfTests.ts`. From the repository root, run:

```bash
npx tsx promptgpt-v2/runSelfTests.cli.ts
```

The runner executes each group sequentially and stops on the first thrown assertion. A successful run returns the total number of passed checks and the per-module results. This command has been documented but has not yet been executed in the current development session.

## Style analyzer limitations

The analyzer records measurable signals and source excerpts, but does not claim full grammatical parsing. Russian participle and gerund detection uses approximate suffix heuristics and can produce false positives or miss forms. Sentence segmentation handles common abbreviations and personal initials, but still needs broader corpus-based testing.

Short samples are explicitly marked limited or insufficient. Their apparent frequent patterns must not be treated as stable authorial traits. The current analyzer is a feature extractor, not a complete author-style fingerprint. The scorer compares measured feature rates and distributions against the donor profile, uses family weights and confidence discounts, and explicitly refuses to score insufficient or version-incompatible profiles. Candidate-only repeated markers are treated as possible overfitting rather than automatic style matches.

The score is a heuristic similarity estimate, not a calibrated probability that a human reader will identify the author. The original donor profile is deep-cloned and recursively frozen before it becomes a baseline. An integrity checksum detects accidental profile substitution or mutation; it is not a cryptographic signature.

Candidate generation uses an injected model adapter, creates independent variants from the same immutable source, limits concurrency, isolates per-candidate provider failures, and binds each result to source and donor-baseline fingerprints. Source text, donor examples, anchors and extracted propositions are serialized as JSON data and explicitly treated as data rather than instructions.

Candidate admission applies the semantic gate first. A style score cannot compensate for missing facts or failed proposition checks. Candidates with inadequate style evidence are marked for review, not silently admitted or assigned a fabricated numeric score. The initial style threshold (70/100) is an engineering default, not an empirically validated cutoff; it must be calibrated against a labeled evaluation corpus before production use. The critic requires every actionable finding to cite an exact candidate span and an excerpt present in the frozen donor evidence. The repair engine accepts only exact replacements for those spans, rejects stale or overlapping patches, and never applies an unverified full-text rewrite. A successful patch is not considered successful work until an independent semantic assessment and a fresh style profile pass the candidate gate. It compares sentence-length buckets, mean and median sentence length, punctuation rates, syntactic and connector rates, repeated openings/closings, lexical repetitions, and paragraph rhythm where the analyzer has enough evidence. Rare markers and lexical repeats have reduced weight. Corpus-wide features with zero observed occurrences remain part of the comparison, so the scorer can detect candidate overuse of traits absent from the donor sample.

The offline regression checks can be invoked from the repository root with a TypeScript runner by importing the exported `run*SelfTests` functions from the corresponding `*.test.ts` files. They have been added but have not yet been executed in this environment. The Gemini adapter maps the router contract to the installed SDK. It forwards AbortSignal to the SDK; the SDK documentation describes this as client-side cancellation, not a guarantee that server-side generation or billing stops immediately. The safe remote transport pins the socket to a previously validated public DNS answer, rejects the request if any DNS answer is private/reserved, refuses redirects and compressed responses, and caps request/response bytes. It is not yet wired into the legacy production route; that route remains unchanged until a separately reviewed integration.

## Not yet implemented

- Natural-language proposition extraction and independent model-backed semantic verification.
- Full author-style parsing, including reliable Russian morphology and clause structure.
- Production API integration and end-to-end provider verification.
- Integration of the new safe remote transport into the existing production route (the current production server is intentionally untouched).
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

The existing application remains untouched during this foundation phase. The application service is an injectable library layer only; it is not yet mounted on Express or connected to the legacy route.

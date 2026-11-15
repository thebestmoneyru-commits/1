import { buildSemanticInventory } from "../semantic/buildInventory";
import { analyzeStyleDNA } from "../style/styleDNAAnalyzer";
import { createDonorStyleBaseline } from "../style/donorBaseline";
import { StyleTransferService } from "./styleTransferService";
import type { StyleTransferRequest } from "./applicationTypes";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fixture() {
  const sourceText = Array.from({ length: 36 }, (_, index) =>
    `В этот день священник пришёл к людям и совершил молитву. После службы он беседовал с каждым человеком, стараясь внимательно выслушать его и поддержать добрым словом.`
  ).join("\n\n");
  const donorProfile = analyzeStyleDNA(sourceText, {
    minWordsForReliableProfile: 1,
    minSentencesForReliableProfile: 1,
  });
  const created = createDonorStyleBaseline(donorProfile);
  assert(created.ok && created.baseline, "fixture donor baseline must be created");
  const built = buildSemanticInventory(sourceText, []);
  assert(built.valid && built.inventory, "fixture semantic inventory must be created");
  const request: StyleTransferRequest = {
    requestId: "application-test",
    sourceText,
    inventory: built.inventory,
    donorBaseline: created.baseline,
    generation: { candidateCount: 1, concurrency: 1, styleIntensity: 3, maxDonorExamples: 2 },
    minimumStyleScore: 0,
    minimumStyleConfidence: 0,
  };
  return { sourceText, request };
}

export async function runStyleTransferServiceSelfTests(): Promise<{ passed: number; names: string[] }> {
  const names: string[] = [];

  {
    const { sourceText, request } = fixture();
    let generationCalls = 0;
    let criticCalls = 0;
    const service = new StyleTransferService({
      candidateGenerator: {
        async generate() { generationCalls++; return sourceText; },
      },
      critic: {
        async review() {
          criticCalls++;
          return JSON.stringify({ styleFidelityScore: 100, naturalnessScore: 100, issues: [] });
        },
      },
      repair: {
        async repair() { throw new Error("repair must not be called for an accepted candidate"); },
      },
      semanticVerifier: {
        async assess() { return []; },
        async assessRelations() { return []; },
      },
      styleProfiler: {
        analyze(text) {
          return analyzeStyleDNA(text, {
            minWordsForReliableProfile: 1,
            minSentencesForReliableProfile: 1,
          });
        },
      },
    });
    const result = await service.execute(request);
    assert(result.status === "accepted", "an identical, semantically valid candidate should be accepted");
    assert(result.selectedText === sourceText, "the selected text must be the generated candidate");
    assert(generationCalls === 1, "one candidate should cause one generation call");
    assert(criticCalls === 0, "an already accepted candidate should bypass critic and repair");
    assert(result.trace.some((event) => event.stage === "completed"), "successful execution should be traced");
    names.push("accept semantically valid candidate and skip unnecessary repair");
  }

  {
    const { sourceText, request } = fixture();
    const end = sourceText.indexOf(".") + 1;
    const inventory = buildSemanticInventory(sourceText, [{
      id: "mandatory-1",
      summary: "Священник пришёл к людям.",
      sourceSpan: { start: 0, end, text: sourceText.slice(0, end) },
      subject: "священник",
      predicate: "пришёл",
      object: "к людям",
      polarity: "positive",
      qualifications: [],
      relations: [],
      mandatory: true,
    }]);
    assert(inventory.valid && inventory.inventory, "semantic failure fixture inventory must be valid");
    let criticCalls = 0;
    const service = new StyleTransferService({
      candidateGenerator: { async generate() { return sourceText; } },
      critic: {
        async review() {
          criticCalls++;
          return JSON.stringify({ styleFidelityScore: 100, naturalnessScore: 100, issues: [] });
        },
      },
      repair: { async repair() { throw new Error("style repair must not run after semantic failure"); } },
      semanticVerifier: { async assess() { return []; } },
      styleProfiler: {
        analyze(text) {
          return analyzeStyleDNA(text, { minWordsForReliableProfile: 1, minSentencesForReliableProfile: 1 });
        },
      },
    });
    const result = await service.execute({ ...request, inventory: inventory.inventory });
    assert(result.status === "rejected", "missing mandatory proposition assessment must reject candidate");
    assert(criticCalls === 0, "style critic must not run after the hard semantic gate fails");
    assert(result.candidates.length === 1 && !result.candidates[0].repaired, "semantically invalid candidate must remain unmodified");
    names.push("block style repair after mandatory semantic gate failure");
  }

  {
    const { request } = fixture();
    let generationCalls = 0;
    const mismatched = {
      ...request,
      inventory: { ...request.inventory, sourceFingerprint: "not-the-source-fingerprint" },
    };
    const service = new StyleTransferService({
      candidateGenerator: {
        async generate() { generationCalls++; return request.sourceText; },
      },
      critic: { async review() { throw new Error("critic must not run"); } },
      repair: { async repair() { throw new Error("repair must not run"); } },
      semanticVerifier: { async assess() { return []; } },
      styleProfiler: {
        analyze(text) {
          return analyzeStyleDNA(text, { minWordsForReliableProfile: 1, minSentencesForReliableProfile: 1 });
        },
      },
    });
    const result = await service.execute(mismatched);
    assert(result.status === "rejected", "inventory/source mismatch must reject the request");
    assert(result.error?.code === "STYLE_TRANSFER_FAILED", "invalid input should return a stable error code");
    assert(generationCalls === 0, "invalid source inventory must fail before model invocation");
    names.push("reject mismatched source inventory before model invocation");
  }

  {
    const { request } = fixture();
    const controller = new AbortController();
    controller.abort();
    let generationCalls = 0;
    const service = new StyleTransferService({
      candidateGenerator: {
        async generate() { generationCalls++; return request.sourceText; },
      },
      critic: { async review() { throw new Error("critic must not run"); } },
      repair: { async repair() { throw new Error("repair must not run"); } },
      semanticVerifier: { async assess() { return []; } },
      styleProfiler: {
        analyze(text) {
          return analyzeStyleDNA(text, { minWordsForReliableProfile: 1, minSentencesForReliableProfile: 1 });
        },
      },
    });
    const result = await service.execute({ ...request, signal: controller.signal });
    assert(result.status === "cancelled", "an already aborted request must return cancelled");
    assert(generationCalls === 0, "cancelled request must not invoke the model");
    names.push("honor cancellation before generation");
  }

  return { passed: names.length, names };
}

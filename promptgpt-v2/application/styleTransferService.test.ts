import { buildSemanticInventory } from "../semantic/buildInventory";
import { getLogicalRelationAuditKey } from "../semantic/semanticStructureAudit";
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
    const firstEnd = sourceText.indexOf(".") + 1;
    const secondStart = sourceText.indexOf("После службы");
    const secondEnd = sourceText.indexOf(".", secondStart) + 1;
    const relation = { kind: "sequence" as const, from: "p1", to: "p2", expression: "После службы" };
    const inventory = buildSemanticInventory(sourceText, [
      {
        id: "p1", summary: "Священник пришёл и совершил молитву.",
        sourceSpan: { start: 0, end: firstEnd, text: sourceText.slice(0, firstEnd) },
        subject: "священник", predicate: "пришёл и совершил", object: "молитву",
        polarity: "positive", qualifications: [], relations: [relation], mandatory: true,
      },
      {
        id: "p2", summary: "Священник беседовал с людьми.",
        sourceSpan: { start: secondStart, end: secondEnd, text: sourceText.slice(secondStart, secondEnd) },
        subject: "священник", predicate: "беседовал", object: "с каждым человеком",
        polarity: "positive", qualifications: [], relations: [relation], mandatory: true,
      },
    ]);
    assert(inventory.valid && inventory.inventory, "relation fixture inventory must be valid");
    let criticCalls = 0;
    const key = getLogicalRelationAuditKey(relation);
    const service = new StyleTransferService({
      candidateGenerator: { async generate() { return sourceText; } },
      critic: { async review() { criticCalls++; throw new Error("critic must not run after relation failure"); } },
      repair: { async repair() { throw new Error("repair must not run after relation failure"); } },
      semanticVerifier: {
        async assess() {
          return [
            { propositionId: "p1", status: "preserved" as const, outputEvidence: [sourceText.slice(0, firstEnd)], rationale: "Сохранено.", confidence: 0.99 },
            { propositionId: "p2", status: "preserved" as const, outputEvidence: [sourceText.slice(secondStart, secondEnd)], rationale: "Сохранено.", confidence: 0.99 },
          ];
        },
        async assessRelations() {
          return [{ relationKey: key, status: "changed" as const, outputEvidence: ["После службы"], rationale: "Временная связь изменена.", confidence: 0.99 }];
        },
      },
      styleProfiler: {
        analyze(text) { return analyzeStyleDNA(text, { minWordsForReliableProfile: 1, minSentencesForReliableProfile: 1 }); },
      },
    });
    const result = await service.execute({ ...request, inventory: inventory.inventory });
    assert(result.status === "rejected", "changed logical relation must reject a candidate even when both propositions are preserved");
    assert(criticCalls === 0, "critic and repair must not run after relation failure");
    assert(result.candidates[0]?.initial.semanticReport.issues.some((issue) => issue.code === "LOGICAL_RELATION_NOT_PRESERVED"), "relation failure must be visible in semantic report");
    names.push("reject changed logical relation when individual propositions survive");
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
      semanticVerifier: { async assess() { return []; }, async assessRelations() { return []; } },
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
      semanticVerifier: { async assess() { return []; }, async assessRelations() { return []; } },
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
      semanticVerifier: { async assess() { return []; }, async assessRelations() { return []; } },
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

  {
    const { sourceText, request } = fixture();
    const spanText = "В этот день священник пришёл к людям";
    const builtWithProp = buildSemanticInventory(sourceText, [{
      id: "p-ungrounded",
      summary: "Священник пришёл к людям.",
      sourceSpan: { start: 0, end: spanText.length, text: spanText },
      subject: "священник",
      predicate: "пришёл",
      object: "к людям",
      polarity: "positive",
      qualifications: [],
      relations: [],
      mandatory: true,
    }]);
    assert(builtWithProp.valid && builtWithProp.inventory, "ungrounded fixture inventory must be valid");
    const transformedCandidate = sourceText.replaceAll(
      "В этот день священник пришёл к людям",
      "Тогда пастырь навестил прихожан",
    );
    let criticCalls = 0;
    const service = new StyleTransferService({
      candidateGenerator: { async generate() { return transformedCandidate; } },
      critic: {
        async review() {
          criticCalls++;
          return JSON.stringify({ styleFidelityScore: 100, naturalnessScore: 100, issues: [] });
        },
      },
      repair: { async repair() { throw new Error("repair must not run after ungrounded semantic evidence"); } },
      semanticVerifier: {
        async assess() {
          return [{
            propositionId: "p-ungrounded",
            status: "preserved" as const,
            outputEvidence: [spanText],
            rationale: "Цитирует исходник вместо сгенерированного текста.",
            confidence: 0.98,
          }];
        },
        async assessRelations() { return []; },
      },
      styleProfiler: {
        analyze(text) {
          return analyzeStyleDNA(text, { minWordsForReliableProfile: 1, minSentencesForReliableProfile: 1 });
        },
      },
    });
    const result = await service.execute({ ...request, inventory: builtWithProp.inventory });
    assert(result.status === "rejected", "ungrounded candidate evidence must reject the request");
    assert(criticCalls === 0, "critic and repair must not run when candidate outputEvidence is ungrounded");
    assert(
      result.candidates[0]?.initial.semanticReport.issues.some((issue) => issue.code === "INVALID_ASSESSMENT"),
      "ungrounded outputEvidence must emit INVALID_ASSESSMENT on initial gate",
    );
    names.push("reject generated candidate with ungrounded outputEvidence before repair");
  }

  {
    const { sourceText, request } = fixture();
    const uniqueTail = " В 1912 году пастырь открыл приходскую библиотеку.";
    const extendedSource = sourceText + uniqueTail;
    const builtTail = buildSemanticInventory(extendedSource, [{
      id: "p-repaired-tail",
      summary: "Пастырь открыл библиотеку в 1912 году.",
      sourceSpan: {
        start: extendedSource.indexOf("В 1912 году пастырь открыл приходскую библиотеку"),
        end: extendedSource.indexOf("В 1912 году пастырь открыл приходскую библиотеку") + "В 1912 году пастырь открыл приходскую библиотеку".length,
        text: "В 1912 году пастырь открыл приходскую библиотеку",
      },
      subject: "пастырь",
      predicate: "открыл",
      object: "приходскую библиотеку",
      polarity: "positive",
      qualifications: [],
      relations: [],
      mandatory: true,
    }]);
    assert(builtTail.valid && builtTail.inventory, "post-repair fixture inventory must be valid");
    const preRepairEvidence = "В 1912 году пастырь открыл приходскую библиотеку";
    const replacementTarget = "открыл приходскую библиотеку";
    const replacementText = "учредил духовную читальню";
    const repairFeature = request.donorBaseline.profile.features.find(
      (item) => item.evidence.length > 0 && item.evidence[0].excerpt.trim().length > 0,
    );
    assert(!!repairFeature, "donor baseline fixture must have grounded evidence");
    const donorExcerpt = repairFeature!.evidence[0].excerpt.trim();
    const targetStart = extendedSource.indexOf(replacementTarget);
    assert(targetStart >= 0, "extendedSource must contain replacementTarget");

    let repairCalls = 0;
    const service = new StyleTransferService({
      candidateGenerator: { async generate() { return extendedSource; } },
      critic: {
        async review() {
          return JSON.stringify({
            styleFidelityScore: 60,
            naturalnessScore: 80,
            issues: [{
              id: "issue-tail",
              type: "syntax-mismatch",
              severity: "warning",
              outputSpan: {
                start: targetStart,
                end: targetStart + replacementTarget.length,
                text: replacementTarget,
              },
              donorFeatureId: repairFeature!.id,
              donorEvidenceExcerpt: donorExcerpt,
              rationale: "Оборот выбивается из целевой манеры.",
              suggestedChange: "Подобрать более соразмерный глагол.",
              affectedPropositionIds: ["p-repaired-tail"],
            }],
          });
        },
      },
      repair: {
        async repair() {
          repairCalls++;
          return JSON.stringify([{
            issueId: "issue-tail",
            expectedText: replacementTarget,
            replacement: replacementText,
          }]);
        },
      },
      semanticVerifier: {
        async assess() {
          // On initial candidate, preRepairEvidence is present; after surgicalRepair replaces
          // replacementTarget -> replacementText, preRepairEvidence no longer exists in repairedText.
          return [{
            propositionId: "p-repaired-tail",
            status: "preserved" as const,
            outputEvidence: [preRepairEvidence],
            rationale: "Ссылка на доремонтную формулировку.",
            confidence: 0.96,
          }];
        },
        async assessRelations() { return []; },
      },
      styleProfiler: {
        analyze(text) {
          return analyzeStyleDNA(text, { minWordsForReliableProfile: 1, minSentencesForReliableProfile: 1 });
        },
      },
    });
    // Force initial candidate into critic-repair by requiring minimumStyleScore > achieved score
    const result = await service.execute({
      ...request,
      sourceText: extendedSource,
      inventory: builtTail.inventory,
      minimumStyleScore: 100,
      minimumStyleConfidence: 0,
    });
    assert(repairCalls === 1, "style-rejected candidate with valid initial semantics must enter surgical repair");
    assert(result.status === "rejected", "stale outputEvidence after surgicalRepair must reject the request");
    assert(result.selectedText === undefined, "rejected post-repair candidate must not be selected");
    assert(
      result.candidates[0]?.repaired === true &&
      result.candidates[0]?.repairPassed === false &&
      result.candidates[0]?.finalEvaluation.semanticReport.passed === false &&
      result.candidates[0]?.finalEvaluation.semanticReport.issues.some((issue) => issue.code === "INVALID_ASSESSMENT"),
      "post-repair evaluation must reject ungrounded outputEvidence against repairedText",
    );
    names.push("reject repaired candidate when post-repair outputEvidence does not match repairedText");
  }

  {
    const { sourceText, request } = fixture();
    let generationCalls = 0;
    const service = new StyleTransferService({
      candidateGenerator: {
        async generate({ candidateIndex }) {
          generationCalls++;
          return candidateIndex === 0 ? sourceText : "этот вариант не должен запрашиваться";
        },
      },
      critic: { async review() { throw new Error("critic must not run for an accepted candidate"); } },
      repair: { async repair() { throw new Error("repair must not run for an accepted candidate"); } },
      semanticVerifier: {
        async assess() { return []; },
        async assessRelations() { return []; },
      },
      styleProfiler: {
        analyze(text) {
          return analyzeStyleDNA(text, { minWordsForReliableProfile: 1, minSentencesForReliableProfile: 1 });
        },
      },
    });
    const result = await service.execute({
      ...request,
      generation: { ...request.generation, candidateCount: 3, adaptive: true },
    });
    assert(result.status === "accepted", "first valid candidate should be accepted");
    assert(generationCalls === 1, "adaptive generation must not request candidates after the first accepted result");
    assert(result.generation.requested === 1 && result.generation.generated === 1,
      "generation metrics must report only candidates actually requested");
    names.push("adaptive generation stops after first fully accepted candidate");
  }

  {
    const { sourceText, request } = fixture();
    const end = sourceText.indexOf(".") + 1;
    const built = buildSemanticInventory(sourceText, [{
      id: "adaptive-required",
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
    assert(built.valid && built.inventory, "adaptive fallback inventory must be valid");
    const service = new StyleTransferService({
      candidateGenerator: {
        async generate({ candidateIndex }) {
          return candidateIndex === 0 ? "Семантически неполный вариант." : sourceText;
        },
      },
      critic: { async review() { throw new Error("critic must not run for the accepted fallback candidate"); } },
      repair: { async repair() { throw new Error("repair must not run for the accepted fallback candidate"); } },
      semanticVerifier: {
        async assess({ candidateText }) {
          if (candidateText !== sourceText) return [];
          return [{
            propositionId: "adaptive-required",
            status: "preserved" as const,
            outputEvidence: [sourceText.slice(0, end)],
            rationale: "Обязательная пропозиция сохранена.",
            confidence: 0.99,
          }];
        },
        async assessRelations() { return []; },
      },
      styleProfiler: {
        analyze(text) {
          return analyzeStyleDNA(text, { minWordsForReliableProfile: 1, minSentencesForReliableProfile: 1 });
        },
      },
    });
    const result = await service.execute({
      ...request,
      inventory: built.inventory,
      generation: { ...request.generation, candidateCount: 3, adaptive: true },
    });
    assert(result.status === "accepted", "second candidate should be tried when the first fails semantic admission");
    assert(result.selectedCandidateId === "candidate-2", "the second candidate should retain its global candidate identity");
    assert(result.generation.requested === 2 && result.generation.failed === 0,
      "generation metrics should include both attempted candidates");
    assert(result.generation.candidates[1]?.candidateIndex === 1,
      "incremental generation should preserve the candidate index offset");
    names.push("adaptive generation requests next candidate only after first candidate fails the semantic gate");
  }

  {
    const { sourceText, request } = fixture();
    let combinedCalls = 0;
    let legacyCalls = 0;
    const service = new StyleTransferService({
      candidateGenerator: { async generate() { return sourceText; } },
      critic: { async review() { throw new Error("critic must not run for an accepted candidate"); } },
      repair: { async repair() { throw new Error("repair must not run for an accepted candidate"); } },
      semanticVerifier: {
        async assess() { legacyCalls++; throw new Error("legacy proposition verifier must not run"); },
        async assessRelations() { legacyCalls++; throw new Error("legacy relation verifier must not run"); },
        async assessCombined() {
          combinedCalls++;
          return { propositionAssessments: [], relationAssessments: [] };
        },
      },
      styleProfiler: {
        analyze(text) {
          return analyzeStyleDNA(text, { minWordsForReliableProfile: 1, minSentencesForReliableProfile: 1 });
        },
      },
    });
    const result = await service.execute(request);
    assert(result.status === "accepted", "combined semantic verification should preserve the normal acceptance path");
    assert(combinedCalls === 1, "combined semantic verifier should be invoked exactly once per candidate");
    assert(legacyCalls === 0, "combined verification must replace, not supplement, the two legacy calls");
    names.push("use one combined semantic-verification call per candidate");
  }

  return { passed: names.length, names };
}

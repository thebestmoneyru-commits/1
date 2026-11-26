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
  const created = createDonorStyleBaseline(donorProfile, sourceText);
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
      getSignalDiagnostics() {
        return {
          modelCalls: [{
            sequence: 1,
            task: "candidate-generation",
            label: "candidate-1:initial",
            requestedModel: "test-model",
            usedModel: "test-model",
            success: true,
            fallbackOccurred: false,
            prompt: "EXACT MODEL-FACING PROMPT",
            responseText: "EXACT PROVIDER RESPONSE",
            attempts: [{ modelId: "test-model", attempt: 1, durationMs: 12 }],
            durationMs: 12,
          }],
        };
      },
    });
    const result = await service.execute(request);
    assert(result.status === "accepted", "an identical, semantically valid candidate should be accepted");
    assert(result.selectedText === sourceText, "the selected text must be the generated candidate");
    assert(result.modelCalls?.[0]?.prompt === "EXACT MODEL-FACING PROMPT", "diagnostics must preserve the exact model-facing prompt");
    assert(result.modelCalls?.[0]?.responseText === "EXACT PROVIDER RESPONSE", "diagnostics must preserve the provider response before post-processing");
    assert(result.selectionDiagnostics?.decision === "accepted" && result.selectionDiagnostics.candidates[0]?.selected,
      "diagnostics must explain the selected candidate and final decision");
    assert(generationCalls === 1, "one candidate should cause one generation call");
    assert(criticCalls === 0, "an already accepted candidate should bypass critic and repair");
    assert(result.trace.some((event) => event.stage === "completed"), "successful execution should be traced");
    assert(result.dnaDiagnostics40?.totalParameters === 40, "successful transfer must expose the complete 40-point Style DNA report");
    assert(result.dnaDiagnostics40?.parameters.length === 40, "40-point diagnostics must contain all sequential parameters");
    assert((result.dnaDiagnostics40?.profileQuality.donor.words ?? 0) > 0, "40-point diagnostics must analyze the original donor corpus");
    const audit = result.candidates[0]?.diagnosticSteps ?? [];
    assert(audit.some((step) => step.stage === "semantic-verification" && step.status === "completed"),
      "candidate diagnostics must record successful semantic verification");
    assert(audit.some((step) => step.stage === "style-scoring" && step.status === "completed"),
      "candidate diagnostics must record style scoring");
    assert(audit.some((step) => step.stage === "style-critic-repair" && step.status === "skipped"),
      "candidate diagnostics must distinguish intentionally skipped critic work");
    assert(audit.some((step) => step.stage === "final-decision" && step.status === "completed"),
      "candidate diagnostics must record the final decision");
    const timedStages = ["candidate-generation", "semantic-verification", "logical-structure", "style-profiling", "style-scoring", "semantic-restoration"];
    assert(timedStages.every((stage) => {
      const step = audit.find((item) => item.stage === stage);
      return !!step && typeof step.durationMs === "number" &&
        Number.isFinite(step.durationMs) && step.durationMs >= 0;
    }), "diagnostic stages must expose finite, non-negative execution durations");
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
    assert(result.candidates[0]?.diagnosticSteps.some((step) => step.stage === "style-critic-repair" && step.status === "skipped"),
      "diagnostics must explain that style repair was deliberately skipped after semantic failure");
    assert(result.candidates.length === 1 && !result.candidates[0].repaired, "semantically invalid candidate must remain unmodified");
    names.push("block style repair after mandatory semantic gate failure");
  }

  {
    const { sourceText, request } = fixture();
    const firstSentenceEnd = sourceText.indexOf(".") + 1;
    const candidateText = sourceText.replaceAll("В этот день ", "");
    const inventory = buildSemanticInventory(sourceText, [{
      id: "p-time-qualification",
      summary: "Священник пришёл к людям в этот день.",
      sourceSpan: { start: 0, end: firstSentenceEnd, text: sourceText.slice(0, firstSentenceEnd) },
      subject: "священник",
      predicate: "пришёл",
      object: "к людям",
      polarity: "positive",
      qualifications: [{ kind: "time", value: "В этот день" }],
      relations: [],
      mandatory: true,
    }]);
    assert(inventory.valid && inventory.inventory, "semantic restoration fixture inventory must be valid");

    let generationCalls = 0;
    let restorationPrompt = "";
    const restoredCandidateText = candidateText.replaceAll("священник пришёл к людям и совершил молитву", "священник пришёл к людям именно в этот день и совершил молитву");
    const service = new StyleTransferService({
      candidateGenerator: {
        async generate({ prompt }) {
          generationCalls++;
          if (prompt.includes("ЗАДАЧА: восстанови")) { restorationPrompt = prompt; return restoredCandidateText; }
          return candidateText;
        },
      },
      critic: { async review() { throw new Error("critic must not run for a restored accepted candidate"); } },
      repair: { async repair() { throw new Error("style repair must not run for a restored accepted candidate"); } },
      semanticVerifier: {
        async assess({ candidateText: checkedText }) {
          const preserved = checkedText === restoredCandidateText;
          return [{
            propositionId: "p-time-qualification",
            status: preserved ? "preserved" as const : "changed" as const,
            outputEvidence: [checkedText.slice(0, checkedText.indexOf(".") + 1)],
            rationale: preserved ? "Временное уточнение сохранено." : "Утрачено временное уточнение «В этот день».",
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
    const result = await service.execute({ ...request, inventory: inventory.inventory });
    assert(result.status === "accepted", "candidate should be accepted after verified semantic restoration");
    assert(result.selectedText === restoredCandidateText, "restoration should recover the missing detail in fresh candidate wording");
    assert(!restorationPrompt.includes("IMMUTABLE ORIGINAL SOURCE JSON") && !restorationPrompt.includes(JSON.stringify(sourceText)), "restoration prompt must not expose the complete source text for reconstruction");
    assert(generationCalls === 2, "semantic restoration should make exactly one additional generation call");
    assert(result.candidates[0]?.initial.semanticReport.passed === false,
      "initial evaluation must retain the original semantic failure");
    assert(result.candidates[0]?.finalEvaluation.semanticReport.passed === true,
      "restored candidate must pass an independent semantic re-check");
    assert(result.candidates[0]?.repaired === true && result.candidates[0]?.repairPassed === true,
      "successful semantic restoration must be recorded as a completed repair");
    assert(result.trace.some((event) => event.stage === "semantic-repair"),
      "semantic restoration must appear in the execution trace");
    names.push("restore missing semantic qualification and independently re-verify");
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

  {
    const { sourceText, request } = fixture();
    let criticCalls = 0;
    const service = new StyleTransferService({
      candidateGenerator: {
        async generate() { return sourceText.replace("молитву.", "молитву — с глубоким вниманием."); },
      },
      critic: {
        async review() {
          criticCalls++;
          return JSON.stringify({
            styleFidelityScore: 55,
            naturalnessScore: 80,
            issues: [],
          });
        },
      },
      repair: {
        async repair() { throw new Error("unexpected repair failure"); },
      },
      semanticVerifier: {
        async assess() { return []; },
        async assessRelations() { return []; },
      },
      styleProfiler: {
        analyze(text) {
          return analyzeStyleDNA(text, { minWordsForReliableProfile: 1, minSentencesForReliableProfile: 1 });
        },
      },
      defaultRequestOptions: {
        criticPolishThreshold: 101,
      },
    });
    const result = await service.execute(request);
    assert(criticCalls === 1, "criticPolishThreshold should trigger critic review for accepted candidate below threshold");
    assert(result.status === "accepted" && typeof result.selectedText === "string" && result.selectedText.length > 0,
      "monotonic guard must retain the previously accepted candidate if critic/repair does not improve or encounters no repairs");
    assert(
      result.candidates[0]?.diagnosticSteps.some((step) => step.stage === "final-decision" && step.status === "completed"),
      "a preserved, already verified fallback must have a completed final decision even if optional polish failed",
    );
    names.push("criticPolishThreshold with monotonic accepted-candidate preservation");
  }

  {
    const { sourceText, request } = fixture();
    const end = sourceText.indexOf(".") + 1;
    const built = buildSemanticInventory(sourceText, [{
      id: "unfiltered-prop",
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
    assert(built.valid && built.inventory, "unfiltered service fixture inventory must be valid");
    const generatedWithErrors = "Священник пришел, к людям с ошибкой текста и без строгой проверки.";
    const service = new StyleTransferService({
      candidateGenerator: { async generate() { return generatedWithErrors; } },
      critic: { async review() { throw new Error("critic must not run in unfilteredMode"); } },
      repair: { async repair() { throw new Error("repair must not run in unfilteredMode"); } },
      semanticVerifier: {
        async assessCombined() { throw new Error("semanticVerifier.assessCombined must not run in unfilteredMode"); },
        async assess() { throw new Error("semanticVerifier.assess must not run in unfilteredMode"); },
        async assessRelations() { throw new Error("semanticVerifier.assessRelations must not run in unfilteredMode"); },
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
      unfilteredMode: true,
      minimumStyleScore: 100,
    });
    assert(result.status === "accepted", "unfilteredMode must accept generated candidate without semantic/style blocking");
    assert(result.selectedText === generatedWithErrors, "unfilteredMode must return the generated candidate text unchanged");
    assert(
      result.warnings.some((w) => w.includes("Режим без фильтрации")),
      "unfilteredMode must record diagnostic warning",
    );
    const steps = result.candidates[0]?.diagnosticSteps ?? [];
    assert(
      steps.some((s) => s.stage === "semantic-verification" && s.status === "skipped") &&
      steps.some((s) => s.stage === "logical-structure" && s.status === "skipped") &&
      steps.some((s) => s.stage === "style-scoring"),
      "unfilteredMode must mark semantic stages as skipped while retaining style scoring",
    );
    names.push("unfilteredMode skips semantic verification and accepts output without blocking");
  }

  {
    const { sourceText, request } = fixture();
    const donorLines = Array.from({ length: 24 }, (_, idx) =>
      `Во-первых, мысль ${idx + 1} звучит иначе — кратко и ясно! Однако вывод тут другой? Конечно.`
    ).join(" ");
    const richDonor = createDonorStyleBaseline(
      analyzeStyleDNA(donorLines, { minWordsForReliableProfile: 1, minSentencesForReliableProfile: 1 }),
      donorLines,
    );
    assert(richDonor.ok && richDonor.baseline, "rich donor baseline fixture must be created");
    let generatedCalls = 0;
    const candidatesByIndex = [
      sourceText,
      "Во-первых, мысль звучит иначе — кратко! Однако тут другой вывод? Возможно.",
      donorLines,
    ];
    const service = new StyleTransferService({
      candidateGenerator: {
        async generate({ candidateIndex }) {
          generatedCalls++;
          return candidatesByIndex[candidateIndex] ?? sourceText;
        },
      },
      critic: { async review() { throw new Error("critic must not run in unfilteredMode"); } },
      repair: { async repair() { throw new Error("repair must not run in unfilteredMode"); } },
      semanticVerifier: {
        async assessCombined() { throw new Error("semanticVerifier must not run in unfilteredMode"); },
        async assess() { throw new Error("semanticVerifier must not run in unfilteredMode"); },
        async assessRelations() { throw new Error("semanticVerifier must not run in unfilteredMode"); },
      },
      styleProfiler: {
        analyze(text) {
          return analyzeStyleDNA(text, { minWordsForReliableProfile: 1, minSentencesForReliableProfile: 1 });
        },
      },
    });
    const result = await service.execute({
      ...request,
      donorBaseline: richDonor.baseline,
      generation: { candidateCount: 3, concurrency: 1, styleIntensity: 5, maxDonorExamples: 12, adaptive: true },
      unfilteredMode: true,
      criticPolishThreshold: 99,
    });
    assert(generatedCalls === 3, "unfilteredMode with low initial style score must generate all 3 candidates");
    assert(result.status === "accepted" && result.selectedCandidateId === "candidate-3",
      "unfilteredMode must select the highest-scoring stylistic candidate out of 3");
    names.push("unfilteredMode evaluates all candidates below polish threshold and picks best style");
  }

  {
    const { sourceText, request } = fixture();
    const service = new StyleTransferService({
      candidateGenerator: { async generate() { return sourceText; } },
      critic: { async review() { throw new Error("critic must not run for accepted candidate"); } },
      repair: { async repair() { throw new Error("repair must not run for accepted candidate"); } },
      semanticVerifier: {
        async assess() { return []; },
        async assessRelations() { return []; },
      },
      styleProfiler: {
        analyze(text) {
          return analyzeStyleDNA(text, { minWordsForReliableProfile: 1, minSentencesForReliableProfile: 1 });
        },
      },
      getSignalDiagnostics() {
        return {
          requestedModel: "gemini-4-hydrogen",
          usedModel: "gemini-3.1-flash-lite",
          fallbackOccurred: true,
          warnings: ["candidate-generation: fallback from gemini-4-hydrogen to gemini-3.1-flash-lite"],
        };
      },
    });
    const result = await service.execute(request);
    assert(result.status === "accepted", "execution with signal diagnostics should still accept valid output");
    assert(result.requestedModel === "gemini-4-hydrogen", "requestedModel must be surfaced on StyleTransferResponse");
    assert(result.usedModel === "gemini-3.1-flash-lite", "usedModel must be surfaced on StyleTransferResponse");
    assert(result.fallbackOccurred === true, "fallbackOccurred must be surfaced on StyleTransferResponse");
    assert(
      result.warnings.some((w) => w.includes("fallback from gemini-4-hydrogen")),
      "router fallback warning from getSignalDiagnostics must be merged into response warnings",
    );
    names.push("surface requestedModel, usedModel, fallbackOccurred, and warnings from getSignalDiagnostics");
  }

  {
    const { sourceText, request } = fixture();
    let recoveryCall = 0;
    const service = new StyleTransferService({
      candidateGenerator: {
        async generate({ prompt }) {
          recoveryCall++;
          if (recoveryCall === 1) throw new Error("503 UNAVAILABLE");
          assert(prompt.includes("ТЕКСТ-ДОНОР") || prompt.includes("ИСХОДНЫЙ ТЕКСТ"), "compact recovery prompt includes source");
          return sourceText;
        },
      },
      critic: { async review() { throw new Error("critic must not run"); } },
      repair: { async repair() { throw new Error("repair must not run"); } },
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
      generation: { ...request.generation, candidateCount: 1, adaptive: true },
      enableCompactRecovery: true,
    });
    assert(recoveryCall === 2 && result.status === "accepted" && result.selectedText === sourceText,
      "enableCompactRecovery must rescue request when initial candidates fail transiently");
    assert(result.warnings.some((w) => w.includes("компактная восстановительная генерация")),
      "compact recovery must record diagnostic warning");
    names.push("enableCompactRecovery rescues failed transient candidate generation");
  }

  {
    const { sourceText, request } = fixture();
    let genCalls = 0;
    const service = new StyleTransferService({
      candidateGenerator: {
        async generate() {
          genCalls++;
          return sourceText;
        },
      },
      critic: { async review() { throw new Error("critic must not run"); } },
      repair: { async repair() { throw new Error("repair must not run"); } },
      semanticVerifier: {
        async assessCombined() { throw new Error("503 UNAVAILABLE"); },
        async assess() { throw new Error("503 UNAVAILABLE"); },
        async assessRelations() { throw new Error("503 UNAVAILABLE"); },
      },
      styleProfiler: {
        analyze(text) {
          return analyzeStyleDNA(text, { minWordsForReliableProfile: 1, minSentencesForReliableProfile: 1 });
        },
      },
    });
    const result = await service.execute({
      ...request,
      generation: { ...request.generation, candidateCount: 2, adaptive: true },
      minimumStyleScore: 0,
    });
    assert(
      result.status === "needs-review" &&
      result.bestAvailableText === sourceText &&
      result.candidates.length === 1 &&
      genCalls === 1,
      "transient semanticVerifier failure must preserve candidate as needs-review with Style DNA score without burning candidate-2",
    );
    names.push("transient verifier failure preserves candidate as needs-review with style scoring");
  }

  {
    const { sourceText, request } = fixture();
    const firstSentenceEnd = sourceText.indexOf(".") + 1;
    const candidateText = sourceText.replaceAll("В этот день ", "");
    const built = buildSemanticInventory(sourceText, [{
      id: "p-restore-retry",
      summary: "Священник пришёл к людям в этот день.",
      sourceSpan: { start: 0, end: firstSentenceEnd, text: sourceText.slice(0, firstSentenceEnd) },
      subject: "священник",
      predicate: "пришёл",
      object: "к людям",
      polarity: "positive",
      qualifications: [{ kind: "time", value: "В этот день" }],
      relations: [],
      mandatory: true,
    }]);
    assert(built.valid && built.inventory, "restoration retry fixture inventory must be valid");
    const restoredRetryText = sourceText.replaceAll("В этот день священник пришёл к людям", "Священник пришёл к людям именно в этот день");
    let restorationCalls = 0;
    const service = new StyleTransferService({
      candidateGenerator: {
        async generate({ prompt }) {
          if (prompt.startsWith("ЗАДАЧА: восстанови в преобразованном тексте")) {
            restorationCalls++;
            if (restorationCalls === 1) throw new Error("503 UNAVAILABLE");
            return restoredRetryText;
          }
          return candidateText;
        },
      },
      critic: { async review() { throw new Error("critic must not run"); } },
      repair: { async repair() { throw new Error("repair must not run"); } },
      semanticVerifier: {
        async assess({ candidateText: checkedText }) {
          const preserved = checkedText === restoredRetryText;
          return [{
            propositionId: "p-restore-retry",
            status: preserved ? "preserved" as const : "changed" as const,
            outputEvidence: [checkedText.slice(0, checkedText.indexOf(".") + 1)],
            rationale: preserved ? "Сохранено." : "Утрачено «В этот день».",
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
      generation: { ...request.generation, candidateCount: 1, adaptive: true },
    });
    assert(
      restorationCalls === 2 && result.status === "accepted" && result.selectedText === restoredRetryText,
      "semantic restoration must retry once after transient 503 UNAVAILABLE",
    );
    names.push("semantic restoration retries once on transient 503 error");
  }

  {
    const { request } = fixture();
    const longSource = "В рамках атеистической парадигмы смысл человеческого существования неизбежно редуцируется к процессу последовательного и сугубо материального улучшения внешних условий бытия, где всё многообразие мировых явлений выступает естественным процессом.";
    const rewrittenCandidate = "Когда человек смотрит на мир чисто по-земному, вся его жизнь сводится лишь к улучшению быта — и больше ни к чему. Ведь любые события вокруг оказываются обычным ходом вещей без всяких тайн.";
    const built = buildSemanticInventory(longSource, [{
      id: "p-long-1",
      summary: "Смысл сводится к улучшению условий бытия.",
      sourceSpan: { start: 0, end: longSource.length, text: longSource },
      subject: "смысл",
      predicate: "редуцируется",
      object: "к улучшению условий",
      polarity: "positive",
      qualifications: [],
      relations: [],
      mandatory: true,
    }]);
    assert(built.valid && built.inventory, "long source fixture inventory must be valid");
    let verifierCalls = 0;
    const service = new StyleTransferService({
      candidateGenerator: {
        async generate({ prompt }) {
          if (prompt.startsWith("ЗАДАЧА: восстанови в преобразованном тексте")) {
            return longSource;
          }
          return rewrittenCandidate;
        },
      },
      critic: { async review() { throw new Error("critic must not run on rejected candidate"); } },
      repair: { async repair() { throw new Error("repair must not run on rejected candidate"); } },
      semanticVerifier: {
        async assess() {
          verifierCalls++;
          return [{
            propositionId: "p-long-1",
            status: "omitted" as const,
            outputEvidence: [],
            rationale: "Упущена часть.",
            confidence: 0.9,
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
      sourceText: longSource,
      inventory: built.inventory,
      generation: { ...request.generation, candidateCount: 1, adaptive: true },
    });
    assert(
      verifierCalls === 1 &&
      result.candidates[0]?.finalText === rewrittenCandidate &&
      result.warnings.some((w) => w.includes("откатилось к синтаксису исходника")),
      "Stage 8 must reject verbatim source rollback before overwriting rewritten candidate",
    );
    names.push("semantic restoration rejects verbatim source rollback");
  }

  return { passed: names.length, names };
}

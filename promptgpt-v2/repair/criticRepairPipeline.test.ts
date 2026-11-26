import { buildFactInventory } from "../semantic/factInventory";
import { analyzeStyleDNA } from "../style/styleDNAAnalyzer";
import { createDonorStyleBaseline } from "../style/donorBaseline";
import { runCriticRepairPipeline } from "./criticRepairPipeline";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Critic-repair pipeline self-test failed: ${message}`);
}
function corpus(): string {
  return Array.from({ length: 24 }, () =>
    "И тогда автор подробно объяснил обстоятельства, поскольку они имели особенное значение. Однако затем повествование продолжилось."
  ).join("\n\n");
}

export async function runCriticRepairPipelineSelfTests(): Promise<{ passed: number; names: string[] }> {
  const names: string[] = [];
  const sourceText = corpus();
  const donorProfile = analyzeStyleDNA(sourceText, {
    minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10,
  });
  const created = createDonorStyleBaseline(donorProfile);
  assert(created.ok && !!created.baseline, "baseline fixture is created");
  const baseline = created.baseline!;
  let semanticCalls = 0;
  let repairCalls = 0;

  const result = await runCriticRepairPipeline({
    candidateId: "pipeline-noop",
    sourceText,
    candidateText: sourceText,
    inventory: buildFactInventory(sourceText),
    donorBaseline: baseline,
    criticAdapter: {
      async review() {
        return JSON.stringify({ styleFidelityScore: 100, naturalnessScore: 100, issues: [] });
      },
    },
    repairAdapter: {
      async repair() {
        repairCalls++;
        throw new Error("repair must not run when critic approves");
      },
    },
    semanticVerifier: {
      async assessRelations() { return []; },
      async assess() {
        semanticCalls++;
        return [];
      },
    },
    styleProfiler: {
      analyze(text) {
        return analyzeStyleDNA(text, {
          minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10,
        });
      },
    },
  });

  assert(result.verificationCompleted, "post-repair verification execution is recorded independently of its verdict");
  assert(result.completed && result.finalText === sourceText, "approved candidate completes without text mutation");
  assert(!result.repairResult.applied && repairCalls === 0, "critic-approved candidate bypasses repair model");
  assert(semanticCalls === 1, "unchanged text reuses its already completed semantic verification");
  assert(result.verification.passed, "final verification is mandatory for pipeline completion");
  names.push("critic-to-verification orchestration");

  const strictInventory = {
    ...buildFactInventory(sourceText),
    propositions: [{
      id: "p1",
      summary: "Содержание исходного текста сохранено.",
      sourceSpan: { start: 0, end: 10, text: sourceText.slice(0, 10) },
      subject: "текст",
      predicate: "содержит",
      object: "утверждение",
      polarity: "positive" as const,
      qualifications: [],
      relations: [],
      mandatory: true,
    }],
  };
  const strictResult = await runCriticRepairPipeline({
    candidateId: "pipeline-strict-policy",
    sourceText,
    candidateText: sourceText,
    inventory: strictInventory,
    donorBaseline: baseline,
    criticAdapter: {
      async review() {
        return JSON.stringify({ styleFidelityScore: 100, naturalnessScore: 100, issues: [] });
      },
    },
    repairAdapter: { async repair() { throw new Error("repair must not run"); } },
    semanticVerifier: {
      async assessRelations() { return []; },
      async assess() {
        return [{
          propositionId: "p1",
          status: "preserved" as const,
          outputEvidence: [sourceText.slice(0, 10)],
          rationale: "Exact source span remains present.",
          confidence: 0.87,
        }];
      },
    },
    styleProfiler: {
      analyze(text) {
        return analyzeStyleDNA(text, {
          minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10,
        });
      },
    },
    semanticPolicy: {
      minimumAssessmentConfidence: 0.9,
      requireEvidenceForPreservedPropositions: true,
      rejectAmbiguousRequiredAnchors: true,
      requireAllMandatoryPropositions: true,
    },
  });
  assert(strictResult.verificationCompleted, "a completed verification may still reject a candidate");
  assert(!strictResult.completed, "repair verification must enforce the request-specific semantic confidence threshold");
  assert(!strictResult.verification.after.semanticReport.passed, "custom semantic policy must reach final verification");
  names.push("semantic policy preserved through repair verification");

  const repairFeature = baseline.profile.features.find((item) => item.evidence.length > 0 && item.evidence[0].excerpt.trim().length > 0);
  assert(!!repairFeature, "baseline fixture must have at least one feature with evidence");
  const repairEvidenceExcerpt = repairFeature!.evidence[0].excerpt.trim();
  const uniqueEvidence = "В 1912 году пастырь открыл приходскую библиотеку";
  const initialCandidate = `${sourceText} ${uniqueEvidence}.`;
  const targetSubstring = "открыл приходскую библиотеку";
  const replacementSubstring = "учредил духовную читальню";
  const targetStart = initialCandidate.indexOf(targetSubstring);
  assert(targetStart >= 0, "candidate fixture must contain targetSubstring");
  const tailInventory = {
    ...buildFactInventory(initialCandidate),
    propositions: [{
      id: "p1",
      summary: "Пастырь открыл приходскую библиотеку в 1912 году.",
      sourceSpan: {
        start: initialCandidate.indexOf(uniqueEvidence),
        end: initialCandidate.indexOf(uniqueEvidence) + uniqueEvidence.length,
        text: uniqueEvidence,
      },
      subject: "пастырь",
      predicate: "открыл",
      object: "приходскую библиотеку",
      polarity: "positive" as const,
      qualifications: [],
      relations: [],
      mandatory: true,
    }],
  };

  let pipelineAssessCalls = 0;
  const stalePostRepairPipeline = await runCriticRepairPipeline({
    candidateId: "pipeline-stale-repaired-evidence",
    sourceText: initialCandidate,
    candidateText: initialCandidate,
    inventory: tailInventory,
    donorBaseline: baseline,
    criticAdapter: {
      async review() {
        return JSON.stringify({
          styleFidelityScore: 60,
          naturalnessScore: 80,
          issues: [{
            id: "issue-1",
            type: "syntax-mismatch",
            severity: "warning",
            outputSpan: {
              start: targetStart,
              end: targetStart + targetSubstring.length,
              text: targetSubstring,
            },
            donorFeatureId: repairFeature!.id,
            donorEvidenceExcerpt: repairEvidenceExcerpt,
            rationale: "Фрагмент требует точечной правки стиля.",
            suggestedChange: "Заменить оборот на более характерный.",
            affectedPropositionIds: ["p1"],
          }],
        });
      },
    },
    repairAdapter: {
      async repair() {
        return JSON.stringify([{
          issueId: "issue-1",
          expectedText: targetSubstring,
          replacement: replacementSubstring,
        }]);
      },
    },
    semanticVerifier: {
      async assessRelations() { return []; },
      async assess() {
        pipelineAssessCalls++;
        // Returns quote valid only before repair; absent from repairedText after replacement.
        return [{
          propositionId: "p1",
          status: "preserved" as const,
          outputEvidence: [uniqueEvidence],
          rationale: "Проверяем точность привязки цитаты после правки.",
          confidence: 0.96,
        }];
      },
    },
    styleProfiler: {
      analyze(text) {
        return analyzeStyleDNA(text, {
          minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10,
        });
      },
    },
  }, { verification: { minimumStyleScore: 0, minimumStyleConfidence: 0 } });

  assert(stalePostRepairPipeline.repairResult.applied, "repair must apply when critic flags an actionable issue");
  assert(stalePostRepairPipeline.finalText !== initialCandidate, "surgical repair must produce modified finalText");
  assert(pipelineAssessCalls === 2, "semantic verifier must re-run against repairedText after modification");
  assert(stalePostRepairPipeline.verification.before.semanticReport.passed, "initial evidence was valid before repair");
  assert(
    !stalePostRepairPipeline.completed &&
    !stalePostRepairPipeline.verification.passed &&
    !stalePostRepairPipeline.verification.after.semanticReport.passed &&
    stalePostRepairPipeline.verification.after.disposition === "rejected" &&
    stalePostRepairPipeline.verification.after.semanticReport.issues.some((issue) => issue.code === "INVALID_ASSESSMENT"),
    "pipeline must reject stale outputEvidence that is absent from repairedText",
  );
  names.push("post-repair semantic evidence must match repairedText");

  return { passed: names.length, names };
}

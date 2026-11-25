import { buildDnaDiagnostics40 } from "./dnaDiagnostics40";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`dnaDiagnostics40 self-test failed: ${message}`);
}

export function runDnaDiagnostics40SelfTests(): { passed: number; names: string[] } {
  const names: string[] = [];

  const donor = [
    "Человек ищет опору — иначе мысль рассыпается.",
    "Во-первых, важна ясность цели; во-вторых, нужна выдержка.",
    "Короткий шаг решает многое (если видеть путь целиком).",
  ].join("\n\n");

  const source = [
    "В рамках сложной системы человек последовательно стремится к материальному улучшению бытия.",
    "Вследствие этого возникает противоречие между желаниями и возможностями.",
  ].join("\n\n");

  const goodResult = [
    "Смысл человеческой жизни — в упорной опоре на улучшение бытия.",
    "Во-первых, важны материальные условия; во-вторых, сказывается предел сил (даже при прогрессе).",
    "Противоречие ясно. Итог всегда упирается в выбор.",
  ].join("\n\n");

  const report = buildDnaDiagnostics40({
    donorText: donor,
    sourceText: source,
    resultText: goodResult,
    styleIntensity: 5,
    elapsedMs: 18400,
    v2Response: {
      status: "accepted",
      requestedModel: "gemini-4-hydrogen",
      usedModel: "gemini-4-hydrogen",
      fallbackOccurred: false,
      selectedCandidateId: "candidate-1",
      candidates: [
        {
          candidateId: "candidate-1",
          repaired: false,
          diagnosticSteps: [
            { stage: "candidate-generation", status: "completed", durationMs: 11200, detail: "ok" },
            { stage: "semantic-verification", status: "completed", durationMs: 4100, detail: "ok" },
            { stage: "logical-structure", status: "completed", durationMs: 12, detail: "ok" },
            { stage: "semantic-restoration", status: "skipped", durationMs: 0, detail: "skipped" },
            { stage: "style-critic-repair", status: "skipped", durationMs: 0, detail: "skipped" },
          ],
          initial: {
            semanticReport: {
              passed: true,
              mandatoryPropositionsPreserved: 4,
              mandatoryPropositionsTotal: 4,
              requiredAnchorsFound: 1,
              requiredAnchorsTotal: 1,
              issues: [],
            },
            styleReport: { score: 83, confidence: 0.72, status: "scored" },
          },
          finalEvaluation: {
            disposition: "accepted",
            semanticReport: {
              passed: true,
              mandatoryPropositionsPreserved: 4,
              mandatoryPropositionsTotal: 4,
              requiredAnchorsFound: 1,
              requiredAnchorsTotal: 1,
              issues: [],
            },
            styleReport: { score: 83, confidence: 0.72, status: "scored" },
          },
        },
      ],
    },
  });

  assert(report.parameters.length === 40, `must return exactly 40 parameters, got ${report.parameters.length}`);
  assert(
    report.parameters.every((p, idx) => p.index === idx + 1 && p.id && p.codeHint),
    "every parameter must have sequential 1..40 index, id, and codeHint",
  );
  assert(
    report.okCount + report.warnCount + report.failCount + report.naCount === 40,
    "status counts must sum to 40",
  );
  names.push("40-parameter completeness and sequential numbering");

  const verbatimReport = buildDnaDiagnostics40({
    donorText: donor,
    sourceText: source,
    resultText: source,
    styleIntensity: 5,
    elapsedMs: 155000,
  });
  const p1 = verbatimReport.parameters.find((p) => p.id === "trigram-overlap");
  const p32 = verbatimReport.parameters.find((p) => p.id === "final-paragraph-rewrite");
  assert(p1?.status === "fail", "verbatim copy of source must fail trigram-overlap");
  assert(p32?.status === "fail", "verbatim copy must fail final-paragraph-rewrite");
  assert(verbatimReport.topCodeRecommendations.length > 0, "failing report must generate prioritized code recommendations");
  names.push("verbatim rollback detection and code improvement recommendations");

  assert(
    report.parameters.every((p) => Number.isFinite(p.confidence) && p.confidence >= 0 && p.confidence <= 1 && !!p.reliability),
    "all 40 parameters must expose bounded confidence and a reliability band",
  );
  assert(report.profileQuality.donor.words > 0 && Array.isArray(report.profileQuality.warnings), "report must expose corpus quality and warnings");
  names.push("per-parameter confidence and corpus-quality reporting");

  const shortReport = buildDnaDiagnostics40({
    donorText: "Короткий текст.",
    sourceText: "Другой короткий текст.",
    resultText: "Ещё один текст.",
  });
  const shortRhythm = shortReport.parameters.find((p) => p.id === "mean-sentence-words");
  assert(shortRhythm?.status === "na", "profile-dependent metrics must be not-applicable for insufficient samples");
  assert(shortRhythm?.confidence === 0 && shortRhythm.reliability === "unavailable", "unreliable profile metrics must not carry artificial confidence");
  names.push("insufficient-sample guard against false style scores");

  const anchorLossReport = buildDnaDiagnostics40({
    donorText: donor,
    sourceText: source,
    resultText: goodResult,
    v2Response: {
      selectedCandidateId: "candidate-anchor-loss",
      candidates: [{
        candidateId: "candidate-anchor-loss",
        finalEvaluation: {
          semanticReport: {
            passed: false,
            mandatoryPropositionsPreserved: 4,
            mandatoryPropositionsTotal: 4,
            requiredAnchorsFound: 0,
            requiredAnchorsTotal: 1,
            issues: [{ code: "missing-anchor", message: "Required number was lost" }],
          },
        },
      }],
    },
  });
  const semanticParam = anchorLossReport.parameters.find((p) => p.id === "semantic-propositions-anchors");
  assert(semanticParam?.status === "fail", "a failed semantic verifier must remain a hard failure even if all propositions passed");
  assert(semanticParam?.resultValue.includes("4/4 проп.") && semanticParam.resultValue.includes("0/1 якор."), "semantic report must display proposition and anchor coverage separately");
  names.push("combined proposition and required-anchor preservation");

  return { passed: names.length, names };
}

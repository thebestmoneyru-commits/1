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

  return { passed: names.length, names };
}

import { buildFactInventory } from "../semantic/factInventory";
import { analyzeStyleDNA } from "../style/styleDNAAnalyzer";
import { createDonorStyleBaseline } from "../style/donorBaseline";
import { buildStyleCriticPrompt, runStyleCritic } from "./styleCritic";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Style critic self-test failed: ${message}`);
}
function donorText(): string {
  return Array.from({ length: 24 }, () =>
    "И тогда автор — человек вдумчивый — подробно объяснил обстоятельства, поскольку они имели особенное значение. Однако затем повествование продолжилось, и мысль получила дальнейшее развитие."
  ).join("\n\n");
}

export async function runStyleCriticSelfTests(): Promise<{ passed: number; names: string[] }> {
  const names: string[] = [];
  const donorProfile = analyzeStyleDNA(donorText(), {
    minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10, maxEvidencePerFeature: 3,
  });
  const created = createDonorStyleBaseline(donorProfile);
  assert(created.ok && !!created.baseline, "donor baseline is available");
  const baseline = created.baseline!;
  const sourceText = "В 1912 году автор описал событие.";
  const candidateText = "Автор описал событие в 1912 году.";
  const inventory = buildFactInventory(sourceText);
  const feature = baseline.profile.features.find((item) => item.evidence.length > 0);
  assert(!!feature, "donor feature has source evidence");
  const donorExcerpt = feature!.evidence[0].excerpt;
  const span = { start: 0, end: 6, text: candidateText.slice(0, 6) };

  const valid = await runStyleCritic({
    sourceText, candidateText, inventory, donorBaseline: baseline,
    adapter: { async review() {
      return JSON.stringify({
        styleFidelityScore: 88, naturalnessScore: 91,
        issues: [{
          id: "issue-1", type: "syntax-mismatch", severity: "warning",
          outputSpan: span, donorFeatureId: feature!.id,
          donorEvidenceExcerpt: donorExcerpt,
          rationale: "Порядок частей отличается от подтверждённого образца.",
          suggestedChange: "Проверить возможность перестройки порядка частей.",
          affectedPropositionIds: [],
        }],
      });
    } },
  });
  assert(valid.issues.length === 1 && valid.issues[0].donorFeatureId === feature!.id,
    "critic accepts an issue tied to exact donor evidence");
  names.push("evidence-grounded critic response");

  const invalidQuote = await runStyleCritic({
    sourceText, candidateText, inventory, donorBaseline: baseline,
    adapter: { async review() {
      return JSON.stringify({
        styleFidelityScore: 90, naturalnessScore: 90,
        issues: [{
          id: "bad-quote", type: "rhythm-mismatch", severity: "warning",
          outputSpan: span, donorFeatureId: feature!.id,
          donorEvidenceExcerpt: "цитата, которой нет в донорском тексте",
          rationale: "Нет подтверждения.", suggestedChange: "Не применять.",
          affectedPropositionIds: [],
        }],
      });
    } },
  }).then(() => false).catch(() => true);
  assert(invalidQuote, "invented donor evidence is rejected");
  names.push("fabricated donor quote rejection");

  const invalidSpan = await runStyleCritic({
    sourceText, candidateText, inventory, donorBaseline: baseline,
    adapter: { async review() {
      return JSON.stringify({
        styleFidelityScore: 90, naturalnessScore: 90,
        issues: [{
          id: "bad-span", type: "syntax-mismatch", severity: "warning",
          outputSpan: { start: 0, end: 6, text: "WRONG!" },
          donorFeatureId: feature!.id, donorEvidenceExcerpt: donorExcerpt,
          rationale: "Проверка.", suggestedChange: "Изменить.", affectedPropositionIds: [],
        }],
      });
    } },
  }).then(() => false).catch(() => true);
  assert(invalidSpan, "stale or fabricated candidate spans are rejected");
  names.push("exact candidate span validation");

  const lowScores = await runStyleCritic({
    sourceText, candidateText, inventory, donorBaseline: baseline,
    adapter: { async review() { return JSON.stringify({ styleFidelityScore: 50, naturalnessScore: 60, issues: [] }); } },
  });
  assert(!lowScores.passed, "low style and naturalness scores do not pass critic");
  names.push("critic threshold enforcement");

  const wrongInventory = { ...inventory, sourceFingerprint: "tampered" };
  const inventoryGuard = await runStyleCritic({
    sourceText, candidateText, inventory: wrongInventory, donorBaseline: baseline,
    adapter: { async review() { throw new Error("must not call model"); } },
  }).then(() => false).catch(() => true);
  assert(inventoryGuard, "critic refuses an inventory from a different source");
  names.push("immutable source inventory guard");

  const validPayload = JSON.stringify({
    styleFidelityScore: 86,
    naturalnessScore: 89,
    issues: [{
      id: "issue-md", type: "syntax-mismatch", severity: "warning",
      outputSpan: span, donorFeatureId: feature!.id,
      donorEvidenceExcerpt: donorExcerpt,
      rationale: "Порядок частей отличается от подтверждённого образца.",
      suggestedChange: "Перестроить порядок слов.",
      affectedPropositionIds: [],
    }],
  });

  const fenced = await runStyleCritic({
    sourceText, candidateText, inventory, donorBaseline: baseline,
    adapter: { async review() { return "```json\n" + validPayload + "\n```"; } },
  });
  assert(fenced.issues.length === 1 && fenced.issues[0].id === "issue-md",
    "critic must parse JSON wrapped in markdown fences");

  const withBom = await runStyleCritic({
    sourceText, candidateText, inventory, donorBaseline: baseline,
    adapter: { async review() { return `\uFEFF${validPayload}`; } },
  });
  assert(withBom.issues.length === 1 && withBom.issues[0].id === "issue-md",
    "critic must parse JSON prefixed with UTF-8 BOM");

  const malformed = await runStyleCritic({
    sourceText, candidateText, inventory, donorBaseline: baseline,
    adapter: { async review() { return "{broken"; } },
  }).then(() => false).catch(() => true);
  assert(malformed, "critic must reject malformed JSON");

  const empty = await runStyleCritic({
    sourceText, candidateText, inventory, donorBaseline: baseline,
    adapter: { async review() { return "   "; } },
  }).then(() => false).catch(() => true);
  assert(empty, "critic must reject empty model responses");

  const wrongShape = await runStyleCritic({
    sourceText, candidateText, inventory, donorBaseline: baseline,
    adapter: { async review() { return "[]"; } },
  }).then(() => false).catch(() => true);
  assert(wrongShape, "critic must still reject non-object JSON payloads");
  names.push("resilient JSON parsing with strict structural validation");

  const shiftedSpanResult = await runStyleCritic({
    sourceText, candidateText, inventory, donorBaseline: baseline,
    adapter: {
      async review() {
        return JSON.stringify({
          styleFidelityScore: 85,
          naturalnessScore: 88,
          issues: [{
            id: "issue-shifted",
            type: "syntax-mismatch",
            severity: "warning",
            outputSpan: { start: 12, end: 20, text: "описал событие" },
            donorFeatureId: feature!.id,
            donorEvidenceExcerpt: donorExcerpt,
            rationale: "Порядок слов отличается от донорского.",
            suggestedChange: "Переставить обстоятельства.",
            affectedPropositionIds: [],
          }],
        });
      },
    },
  });
  const expectedOffset = candidateText.indexOf("описал событие");
  assert(
    shiftedSpanResult.issues.length === 1 &&
    shiftedSpanResult.issues[0].outputSpan.start === expectedOffset &&
    shiftedSpanResult.issues[0].outputSpan.end === expectedOffset + "описал событие".length,
    "critic must anchor verbatim candidate quotes even when model offsets are imprecise",
  );
  names.push("anchor verbatim critic span offsets");

  const criticPrompt = buildStyleCriticPrompt({
    sourceText,
    candidateText,
    inventory,
    donorBaseline: baseline,
  });
  const evidenceHeader = "DONOR STYLE EVIDENCE JSON:\n";
  const evidenceSlice = criticPrompt.slice(criticPrompt.indexOf(evidenceHeader) + evidenceHeader.length);
  const evidenceJson = JSON.parse(evidenceSlice.slice(0, evidenceSlice.indexOf("\n\nSOURCE PROPOSITIONS JSON:"))) as {
    corpusSummary: { meanWordsPerSentence: number; absentDonorTraits: Array<{ featureId: string }> };
    featuresWithEvidence: Array<{ featureId: string; rate: number; examples: string[] }>;
  };
  assert(evidenceJson.corpusSummary.meanWordsPerSentence > 0 &&
    evidenceJson.corpusSummary.absentDonorTraits.some((item) => item.featureId === "punctuation.exclamation"),
    "critic prompt receives corpusSummary and absentDonorTraits");
  assert(
    evidenceJson.featuresWithEvidence.some((item) => item.featureId === "rhythm.mean-sentence-length") &&
    evidenceJson.featuresWithEvidence.some((item) => item.featureId === "punctuation.dash"),
    "critic prompt includes grounded rhythm and punctuation features for quantitative critique",
  );
  names.push("critic prompt exposes corpusSummary, absentDonorTraits, rhythm, and punctuation evidence");

  return { passed: names.length, names };
}

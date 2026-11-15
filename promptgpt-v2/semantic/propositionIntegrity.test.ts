import { DEFAULT_SEMANTIC_POLICY, type Proposition } from "../types";
import { buildSemanticInventory } from "./buildInventory";
import { verifyPropositionAssessments } from "./propositionIntegrity";
import { evaluateSemanticPreservation } from "./semanticPreservation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Proposition integrity self-test failed: ${message}`);
}

export function runPropositionIntegritySelfTests(): { passed: number; names: string[] } {
  const names: string[] = [];
  const sourceText = "Святитель Тихон приехал в епархию. Там он основал новую школу.";
  const candidateText = "Архипастырь прибыл в епархию. Вскоре им была открыта новая школа.";

  const spanText = "Святитель Тихон приехал в епархию";
  const propositions: Proposition[] = [
    {
      id: "p1",
      summary: "Святитель приехал в епархию",
      sourceSpan: { start: 0, end: spanText.length, text: spanText },
      subject: "Святитель Тихон",
      predicate: "приехал",
      object: "в епархию",
      polarity: "positive",
      qualifications: [],
      relations: [],
      mandatory: true,
    },
  ];
  const built = buildSemanticInventory(sourceText, propositions);
  assert(built.valid && !!built.inventory, "test semantic inventory must build");
  const inventory = built.inventory!;

  // 1. Существующая цитата в кандидате
  const existing = verifyPropositionAssessments(
    propositions,
    [{
      propositionId: "p1",
      status: "preserved",
      outputEvidence: ["Архипастырь прибыл в епархию"],
      rationale: "Фраза присутствует в кандидате.",
      confidence: 0.95,
    }],
    DEFAULT_SEMANTIC_POLICY,
    candidateText,
  );
  assert(existing.passed && existing.preservedMandatory === 1,
    "existing candidate quote must be accepted");
  names.push("accept existing verbatim candidate evidence");

  // 2. Выдуманная цитата, которой нет ни в источнике, ни в кандидате
  const fabricated = verifyPropositionAssessments(
    propositions,
    [{
      propositionId: "p1",
      status: "preserved",
      outputEvidence: ["Епископ посетил монастырь"],
      rationale: "Выдуманное доказательство.",
      confidence: 0.95,
    }],
    DEFAULT_SEMANTIC_POLICY,
    candidateText,
  );
  assert(!fabricated.passed && fabricated.preservedMandatory === 0 &&
    fabricated.issues.some((issue) => issue.code === "INVALID_ASSESSMENT"),
    "fabricated evidence must be rejected");
  names.push("reject fabricated evidence absent from candidate");

  // 3. Цитата из исходного текста, которой нет в результате (проверка через evaluateSemanticPreservation)
  const sourceOnly = evaluateSemanticPreservation({
    sourceText,
    outputText: candidateText,
    inventory,
    propositionAssessments: [{
      propositionId: "p1",
      status: "preserved",
      outputEvidence: ["Святитель Тихон приехал в епархию"],
      rationale: "Цитирует оригинал вместо результата.",
      confidence: 0.95,
    }],
  });
  assert(!sourceOnly.passed && sourceOnly.mandatoryPropositionsPreserved === 0 &&
    sourceOnly.issues.some((issue) => issue.code === "INVALID_ASSESSMENT"),
    "source-only quote absent from candidate must be rejected");
  names.push("reject source quote missing from candidate output");

  // 4. Пустая цитата (пустая строка и строка из пробелов)
  const emptyQuote = verifyPropositionAssessments(
    propositions,
    [{
      propositionId: "p1",
      status: "preserved",
      outputEvidence: [""],
      rationale: "Пустое доказательство.",
      confidence: 0.95,
    }],
    DEFAULT_SEMANTIC_POLICY,
    candidateText,
  );
  const whitespaceQuote = verifyPropositionAssessments(
    propositions,
    [{
      propositionId: "p1",
      status: "preserved",
      outputEvidence: ["   "],
      rationale: "Пробельное доказательство.",
      confidence: 0.95,
    }],
    DEFAULT_SEMANTIC_POLICY,
    candidateText,
  );
  assert(!emptyQuote.passed && !whitespaceQuote.passed,
    "empty and whitespace-only quotes must be rejected");
  names.push("reject empty and whitespace-only evidence");

  // 5. Несколько доказательств: все валидные (PASS) и смешанные валидная+выдуманная / валидная+пустая (FAIL)
  const multipleValid = verifyPropositionAssessments(
    propositions,
    [{
      propositionId: "p1",
      status: "preserved",
      outputEvidence: ["Архипастырь прибыл в епархию", "была открыта новая школа"],
      rationale: "Несколько подтверждённых цитат.",
      confidence: 0.95,
    }],
    DEFAULT_SEMANTIC_POLICY,
    candidateText,
  );
  assert(multipleValid.passed && multipleValid.preservedMandatory === 1,
    "multiple valid candidate quotes must be accepted");

  const multipleWithFabricated = verifyPropositionAssessments(
    propositions,
    [{
      propositionId: "p1",
      status: "preserved",
      outputEvidence: ["Архипастырь прибыл в епархию", "выдуманный фрагмент"],
      rationale: "Смешанный массив доказательств.",
      confidence: 0.95,
    }],
    DEFAULT_SEMANTIC_POLICY,
    candidateText,
  );
  const multipleWithEmpty = verifyPropositionAssessments(
    propositions,
    [{
      propositionId: "p1",
      status: "preserved",
      outputEvidence: ["Архипастырь прибыл в епархию", ""],
      rationale: "Валидная цитата плюс пустая.",
      confidence: 0.95,
    }],
    DEFAULT_SEMANTIC_POLICY,
    candidateText,
  );
  assert(!multipleWithFabricated.passed && !multipleWithEmpty.passed,
    "every item in outputEvidence must be non-empty and present in candidate");
  names.push("validate every item when multiple evidences are supplied");

  // 6. Запрет обхода проверки без candidateText в рантайме
  const runtimeGuardTriggered = (() => {
    try {
      verifyPropositionAssessments(
        propositions,
        [{
          propositionId: "p1",
          status: "preserved",
          outputEvidence: ["Выдуманная цитата"],
          rationale: "Попытка вызова без candidateText.",
          confidence: 0.95,
        }],
        DEFAULT_SEMANTIC_POLICY,
        undefined as unknown as string,
      );
      return false;
    } catch (error) {
      return error instanceof TypeError;
    }
  })();
  assert(runtimeGuardTriggered, "omitting candidateText at runtime must throw TypeError");
  names.push("reject missing candidateText at runtime");

  return { passed: names.length, names };
}

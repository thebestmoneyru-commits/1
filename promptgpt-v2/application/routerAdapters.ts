import { Type } from "@google/genai";
import type { ModelRouter, ModelTask } from "../infrastructure/modelRouter";
import { parseJsonUnknown, isRecord, isNonEmptyString, isFiniteNumberInRange } from "../infrastructure/jsonValidation";
import type { PropositionAssessment } from "../types";
import type { CandidateModelAdapter } from "../style/candidateGenerator";
import type { StyleCriticAdapter } from "../critic/styleCritic";
import type { SurgicalRepairAdapter } from "../repair/surgicalRepair";
import type { SemanticVerifier } from "./applicationTypes";
import { getLogicalRelationAuditKey } from "../semantic/semanticStructureAudit";
import type { LogicalRelationAssessment } from "../semantic/logicalRelationPreservation";
import type { ApplicationModelRoutes } from "./applicationTypes";

const PROPOSITION_ASSESSMENT_ARRAY_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      propositionId: { type: Type.STRING },
      status: { type: Type.STRING, enum: ["preserved", "changed", "omitted", "uncertain"] },
      outputEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
      rationale: { type: Type.STRING },
      confidence: { type: Type.NUMBER },
    },
    required: ["propositionId", "status", "outputEvidence", "rationale", "confidence"],
  },
};

const RELATION_ASSESSMENT_ARRAY_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      relationKey: { type: Type.STRING },
      status: { type: Type.STRING, enum: ["preserved", "changed", "omitted", "uncertain"] },
      outputEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
      rationale: { type: Type.STRING },
      confidence: { type: Type.NUMBER },
    },
    required: ["relationKey", "status", "outputEvidence", "rationale", "confidence"],
  },
};

const COMBINED_VERIFICATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    propositionAssessments: PROPOSITION_ASSESSMENT_ARRAY_SCHEMA,
    relationAssessments: RELATION_ASSESSMENT_ARRAY_SCHEMA,
  },
  required: ["propositionAssessments", "relationAssessments"],
};

const CRITIC_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    styleFidelityScore: { type: Type.NUMBER },
    naturalnessScore: { type: Type.NUMBER },
    issues: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: {
            type: Type.STRING,
            enum: [
              "syntax-mismatch",
              "rhythm-mismatch",
              "punctuation-mismatch",
              "connector-mismatch",
              "lexical-overfitting",
              "paragraph-structure",
              "unnatural-construction",
              "unsupported-style-claim",
            ],
          },
          severity: { type: Type.STRING, enum: ["blocking", "warning", "info"] },
          outputSpan: {
            type: Type.OBJECT,
            properties: {
              start: { type: Type.INTEGER },
              end: { type: Type.INTEGER },
              text: { type: Type.STRING },
            },
            required: ["start", "end", "text"],
          },
          donorFeatureId: { type: Type.STRING },
          donorEvidenceExcerpt: { type: Type.STRING },
          rationale: { type: Type.STRING },
          suggestedChange: { type: Type.STRING },
          affectedPropositionIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: [
          "id",
          "type",
          "severity",
          "outputSpan",
          "donorFeatureId",
          "donorEvidenceExcerpt",
          "rationale",
          "suggestedChange",
          "affectedPropositionIds",
        ],
      },
    },
  },
  required: ["styleFidelityScore", "naturalnessScore", "issues"],
};

const REPAIR_RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      issueId: { type: Type.STRING },
      expectedText: { type: Type.STRING },
      replacement: { type: Type.STRING },
    },
    required: ["issueId", "expectedText", "replacement"],
  },
};

export interface ModelInvocationTelemetry {
  task: ModelTask;
  requestedModel: string;
  usedModel: string;
  fallbackOccurred: boolean;
  warnings: string[];
  signal?: AbortSignal;
}

export interface RouterAdaptersOptions {
  onModelResult?: (telemetry: ModelInvocationTelemetry) => void;
}

function routeFor(routes: ApplicationModelRoutes, task: ModelTask) {
  switch (task) {
    case "candidate-generation": return routes.candidateGeneration;
    case "style-critique": return routes.styleCritique;
    case "surgical-repair": return routes.surgicalRepair;
    case "semantic-verification": return routes.semanticVerification;
    default: throw new Error(`No application route is configured for task ${task}.`);
  }
}

function thinkingForTask(task: ModelTask): "low" | "medium" | "high" {
  switch (task) {
    case "candidate-generation":
    case "style-critique":
    case "surgical-repair":
    case "semantic-verification":
    case "semantic-extraction":
      return "high";
    default:
      return "medium";
  }
}

function timeoutForTask(task: ModelTask): number {
  return task === "candidate-generation" ? 120_000 : 90_000;
}

async function invoke(
  router: ModelRouter,
  routes: ApplicationModelRoutes,
  task: ModelTask,
  prompt: string,
  signal?: AbortSignal,
  responseSchema?: unknown,
  onModelResult?: (telemetry: ModelInvocationTelemetry) => void,
): Promise<string> {
  const route = routeFor(routes, task);
  const result = await router.generate({
    task,
    preferredModel: route.preferredModel,
    fallbackModels: route.fallbackModels,
    prompt,
    responseSchema,
    thinking: thinkingForTask(task),
    signal,
    timeoutMs: timeoutForTask(task),
    maxAttemptsPerModel: 3,
  });
  onModelResult?.({
    task,
    requestedModel: result.requestedModel,
    usedModel: result.usedModel,
    fallbackOccurred: result.fallbackOccurred,
    warnings: [...result.warnings],
    signal,
  });
  return result.text;
}

function validateRelationAssessments(value: unknown): value is LogicalRelationAssessment[] {
  return Array.isArray(value) && value.every((item) =>
    isRecord(item) && isNonEmptyString(item.relationKey) &&
    ["preserved", "changed", "omitted", "uncertain"].includes(String(item.status)) &&
    Array.isArray(item.outputEvidence) && item.outputEvidence.every((evidence) => typeof evidence === "string") &&
    typeof item.rationale === "string" && isFiniteNumberInRange(item.confidence, 0, 1)
  );
}

function validateAssessments(value: unknown): value is PropositionAssessment[] {
  return Array.isArray(value) && value.every((item) =>
    isRecord(item) &&
    isNonEmptyString(item.propositionId) &&
    ["preserved", "changed", "omitted", "uncertain"].includes(String(item.status)) &&
    Array.isArray(item.outputEvidence) &&
    item.outputEvidence.every((evidence) => typeof evidence === "string") &&
    typeof item.rationale === "string" &&
    isFiniteNumberInRange(item.confidence, 0, 1)
  );
}

/** Creates adapters backed by one shared router and its long-lived provider client. */
export function createRouterAdapters(
  router: ModelRouter,
  routes: ApplicationModelRoutes,
  options: RouterAdaptersOptions = {},
): {
  candidateGenerator: CandidateModelAdapter;
  critic: StyleCriticAdapter;
  repair: SurgicalRepairAdapter;
  semanticVerifier: SemanticVerifier;
} {
  const onModelResult = options.onModelResult;
  return {
    candidateGenerator: {
      generate: ({ prompt, signal }) => invoke(router, routes, "candidate-generation", prompt, signal, undefined, onModelResult),
    },
    critic: {
      review: (prompt, signal) => invoke(router, routes, "style-critique", prompt, signal, CRITIC_RESPONSE_SCHEMA, onModelResult),
    },
    repair: {
      repair: (prompt, signal) => invoke(router, routes, "surgical-repair", prompt, signal, REPAIR_RESPONSE_SCHEMA, onModelResult),
    },
    semanticVerifier: {
      async assessCombined({ sourceText, candidateText, propositions, signal }) {
        const relations = new Map<string, unknown>();
        for (const proposition of propositions) {
          for (const relation of proposition.relations) relations.set(getLogicalRelationAuditKey(relation), relation);
        }
        const prompt = [
          "Выполни две отдельные проверки сохранения смысла кандидата относительно оригинала. Это два самостоятельных отчёта в одном JSON-ответе; не смешивай их элементы.",
          "ОТЧЁТ 1 — propositionAssessments: проверь каждую исходную пропозицию отдельно: субъект, предикат, объект, отрицание, модальность, условия, оговорки, причинность, последовательность и атрибуцию. Отдельно сверь КАЖДОЕ значение qualifications и modality: нельзя признать пропозицию полностью сохранённой, если основной тезис остался, но исчезло существенное уточнение, ограничение, степень, частотность, временная оговорка или усилитель. Смысловой эквивалент допускается; буквальное совпадение не требуется. Верни ровно одну оценку на каждый propositionId. Статусы: preserved, changed, omitted, uncertain. outputEvidence — точные непустые фрагменты кандидата; при preserved приводи фрагмент, подтверждающий именно проверяемое содержание и его уточнения. При сомнении используй uncertain.",
          "ОТЧЁТ 2 — relationAssessments: проверь каждую исходную логическую связь отдельно. Наличие обоих фактов не доказывает сохранение связи. Проверь направление, тип, причинность, временной порядок, условия, уступки, цель, противопоставление, сравнение и атрибуцию. Не требуй исходного союза дословно: допускай равнозначную синтаксическую конструкцию, но только если она сохраняет то же отношение между теми же положениями и то же направление. При preserved outputEvidence должен содержать точный фрагмент кандидата (обычно полное предложение или клаузу), в котором видны оба связанных положения и связь между ними. Не возвращай пустое evidence для preserved. Для каждой relationKey верни ровно одну оценку со статусом preserved, changed, omitted или uncertain. Не выдумывай цитаты.",
          "Не пропускай элементы. Не добавляй неизвестные ID или ключи. Если исходных связей нет, верни relationAssessments: []. При любой неопределённости укажи uncertain.",
          "Верни только JSON-объект: {propositionAssessments:[{propositionId,status,outputEvidence,rationale,confidence}],relationAssessments:[{relationKey,status,outputEvidence,rationale,confidence}]}. confidence — число от 0 до 1.",
          "", "ORIGINAL SOURCE JSON:", JSON.stringify(sourceText),
          "", "CANDIDATE JSON:", JSON.stringify(candidateText),
          "", "SOURCE PROPOSITIONS JSON:", JSON.stringify(propositions),
          "", "SOURCE RELATIONS JSON:", JSON.stringify([...relations.entries()].map(([relationKey, relation]) => ({ relationKey, relation }))),
        ].join("\n");
        const raw = await invoke(router, routes, "semantic-verification", prompt, signal, COMBINED_VERIFICATION_SCHEMA, onModelResult);
        const parsed = parseJsonUnknown(raw);
        if (!isRecord(parsed) || !validateAssessments(parsed.propositionAssessments) ||
            !validateRelationAssessments(parsed.relationAssessments)) {
          throw new Error("Combined semantic verifier returned invalid proposition or relation assessments.");
        }
        return {
          propositionAssessments: parsed.propositionAssessments,
          relationAssessments: parsed.relationAssessments,
        };
      },
      async assess({ sourceText, candidateText, propositions, signal }) {
        const prompt = [
          "Проведи независимую проверку сохранения содержания преобразованного текста относительно неизменного оригинала.",
          "Проверь каждую пропозицию отдельно: субъект, предикат, объект, отрицание, модальность, условия, оговорки, причинность, последовательность и атрибуцию. Обязательно проверь каждое уточнение в qualifications и modality; основной тезис без существенного уточнения не считается полностью сохранённым. Семантически равнозначная формулировка считается preserved, даже если слова отличаются.",
          "Не считай стилистическое сходство доказательством смысловой сохранности. Не додумывай отсутствующие утверждения.",
          "Для каждого ID верни ровно одну оценку. outputEvidence — точные фрагменты преобразованного текста. При сомнении используй uncertain.",
          "Верни только JSON-массив: [{propositionId,status,outputEvidence,rationale,confidence}]. confidence — число от 0 до 1.",
          "",
          "ORIGINAL SOURCE JSON:",
          JSON.stringify(sourceText),
          "",
          "CANDIDATE JSON:",
          JSON.stringify(candidateText),
          "",
          "SOURCE PROPOSITIONS JSON:",
          JSON.stringify(propositions),
        ].join("\n");
        const raw = await invoke(router, routes, "semantic-verification", prompt, signal, PROPOSITION_ASSESSMENT_ARRAY_SCHEMA, onModelResult);
        const parsed = parseJsonUnknown(raw);
        if (!validateAssessments(parsed)) {
          throw new Error("Semantic verifier returned an invalid assessment array.");
        }
        return parsed;
      },
      async assessRelations({ sourceText, candidateText, propositions, signal }) {
        const relations = new Map<string, unknown>();
        for (const proposition of propositions) {
          for (const relation of proposition.relations) relations.set(getLogicalRelationAuditKey(relation), relation);
        }
        if (relations.size === 0) return [];
        const prompt = [
          "Проведи независимое сравнение логической структуры оригинала и преобразованного текста.",
          "Оцени каждую исходную логическую связь ровно один раз: направление причины и следствия, временной порядок, условия, уступки, цель, противопоставление, сравнение и атрибуцию.",
          "Факты могут сохраниться, даже если связь между ними перевёрнута, ослаблена или исчезла. Не считай простое наличие обоих фактов сохранением связи.",
          "Для каждой связи верни status: preserved, changed, omitted или uncertain. Не требуй исходный союз дословно: допускай равнозначную синтаксическую конструкцию, если сохраняется то же отношение между теми же положениями и его направление. При preserved укажи точный фрагмент кандидата (полное предложение или клаузу), показывающий оба связанных положения и отношение между ними. Не оставляй outputEvidence пустым и не выдумывай цитаты.",
          "relationKey должен дословно совпадать с ключом связи из SOURCE RELATIONS JSON. Верни только JSON-массив объектов {relationKey,status,outputEvidence,rationale,confidence}.",
          "", "ORIGINAL SOURCE JSON:", JSON.stringify(sourceText),
          "", "CANDIDATE JSON:", JSON.stringify(candidateText),
          "", "SOURCE RELATIONS JSON:", JSON.stringify([...relations.entries()].map(([relationKey, relation]) => ({ relationKey, relation }))),
        ].join("\n");
        const raw = await invoke(router, routes, "semantic-verification", prompt, signal, RELATION_ASSESSMENT_ARRAY_SCHEMA, onModelResult);
        const parsed = parseJsonUnknown(raw);
        if (!validateRelationAssessments(parsed)) throw new Error("Semantic structure verifier returned an invalid relation assessment array.");
        return parsed;
      },
    },
  };
}

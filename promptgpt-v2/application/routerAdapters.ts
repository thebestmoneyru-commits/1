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

function routeFor(routes: ApplicationModelRoutes, task: ModelTask) {
  switch (task) {
    case "candidate-generation": return routes.candidateGeneration;
    case "style-critique": return routes.styleCritique;
    case "surgical-repair": return routes.surgicalRepair;
    case "semantic-verification": return routes.semanticVerification;
    default: throw new Error(`No application route is configured for task ${task}.`);
  }
}
async function invoke(
  router: ModelRouter,
  routes: ApplicationModelRoutes,
  task: ModelTask,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const route = routeFor(routes, task);
  const result = await router.generate({
    task,
    preferredModel: route.preferredModel,
    fallbackModels: route.fallbackModels,
    prompt,
    signal,
    timeoutMs: task === "candidate-generation" ? 90_000 : 45_000,
    maxAttemptsPerModel: 2,
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
export function createRouterAdapters(router: ModelRouter, routes: ApplicationModelRoutes): {
  candidateGenerator: CandidateModelAdapter;
  critic: StyleCriticAdapter;
  repair: SurgicalRepairAdapter;
  semanticVerifier: SemanticVerifier;
} {
  return {
    candidateGenerator: {
      generate: ({ prompt, signal }) => invoke(router, routes, "candidate-generation", prompt, signal),
    },
    critic: {
      review: (prompt, signal) => invoke(router, routes, "style-critique", prompt, signal),
    },
    repair: {
      repair: (prompt, signal) => invoke(router, routes, "surgical-repair", prompt, signal),
    },
    semanticVerifier: {
      async assess({ sourceText, candidateText, propositions, signal }) {
        const prompt = [
          "Проведи независимую проверку сохранения содержания преобразованного текста относительно неизменного оригинала.",
          "Проверь каждую пропозицию отдельно: субъект, предикат, объект, отрицание, модальность, условия, оговорки, причинность, последовательность и атрибуцию.",
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
        const raw = await invoke(router, routes, "semantic-verification", prompt, signal);
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
          "Для каждой связи верни status: preserved, changed, omitted или uncertain. При preserved укажи точный фрагмент кандидата в outputEvidence. Не выдумывай цитаты.",
          "relationKey должен дословно совпадать с ключом связи из SOURCE RELATIONS JSON. Верни только JSON-массив объектов {relationKey,status,outputEvidence,rationale,confidence}.",
          "", "ORIGINAL SOURCE JSON:", JSON.stringify(sourceText),
          "", "CANDIDATE JSON:", JSON.stringify(candidateText),
          "", "SOURCE RELATIONS JSON:", JSON.stringify([...relations.entries()].map(([relationKey, relation]) => ({ relationKey, relation }))),
        ].join("\\n");
        const raw = await invoke(router, routes, "semantic-verification", prompt, signal);
        const parsed = parseJsonUnknown(raw);
        if (!validateRelationAssessments(parsed)) throw new Error("Semantic structure verifier returned an invalid relation assessment array.");
        return parsed;
      },
    },
  };
}

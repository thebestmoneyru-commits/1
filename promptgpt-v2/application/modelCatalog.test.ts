import { validateModelCatalog } from "./modelCatalog";
import type { ModelDefinition } from "../infrastructure/modelRouter";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const model = (id: string, tasks: ModelDefinition["tasks"]): ModelDefinition => ({
  id, tasks, enabled: true, maxConcurrency: 2, maxQueueLength: 10,
  supportsJsonSchema: true, supportsThinking: true, supportsSampling: true,
});

export function runApplicationSelfTests(): { passed: number; names: string[] } {
  const tasks = ["candidate-generation", "style-critique", "surgical-repair", "semantic-verification", "semantic-extraction"] as const;
  const routes = {
    candidateGeneration: { preferredModel: "gen", fallbackModels: ["backup"] },
    styleCritique: { preferredModel: "critic" },
    surgicalRepair: { preferredModel: "repair" },
    semanticVerification: { preferredModel: "semantic" },
    semanticExtraction: { preferredModel: "extractor" },
    semanticAudit: { preferredModel: "auditor" },
  };
  const valid = validateModelCatalog({
    models: [
      model("gen", ["candidate-generation"]),
      model("backup", ["candidate-generation"]),
      model("critic", ["style-critique"]),
      model("repair", ["surgical-repair"]),
      model("semantic", ["semantic-verification"]),
      model("extractor", ["semantic-extraction"]),
      model("auditor", ["semantic-extraction"]),
    ],
    routes,
  });
  assert(valid.models.length === 7, "valid explicit catalog must be returned");
  let missingModelRejected = false;
  try {
    validateModelCatalog({ models: [model("gen", tasks)], routes });
  } catch { missingModelRejected = true; }
  assert(missingModelRejected, "unknown route model must be rejected");
  let taskMismatchRejected = false;
  try {
    validateModelCatalog({
      models: [model("gen", tasks), model("backup", ["general"]), model("critic", tasks), model("repair", tasks), model("semantic", tasks), model("extractor", tasks), model("auditor", ["semantic-extraction"])],
      routes,
    });
  } catch { taskMismatchRejected = true; }
  assert(taskMismatchRejected, "route model with incompatible task must be rejected");
  let sameAuditModelRejected = false;
  try {
    validateModelCatalog({
      models: [model("gen", ["candidate-generation"]), model("backup", ["candidate-generation"]),
        model("critic", ["style-critique"]), model("repair", ["surgical-repair"]),
        model("semantic", ["semantic-verification"]), model("extractor", ["semantic-extraction"])],
      routes: { ...routes, semanticAudit: { preferredModel: "extractor" } },
    });
  } catch { sameAuditModelRejected = true; }
  assert(sameAuditModelRejected, "independent audit route must not reuse the extraction preferred model");
  let sharedAuditFallbackRejected = false;
  try {
    validateModelCatalog({
      models: [model("gen", ["candidate-generation"]), model("backup", ["candidate-generation"]),
        model("critic", ["style-critique"]), model("repair", ["surgical-repair"]),
        model("semantic", ["semantic-verification"]), model("extractor", ["semantic-extraction"]),
        model("auditor", ["semantic-extraction"])],
      routes: { ...routes, semanticAudit: { preferredModel: "auditor", fallbackModels: ["extractor"] } },
    });
  } catch { sharedAuditFallbackRejected = true; }
  assert(sharedAuditFallbackRejected, "audit fallback must not silently reuse extraction model");
  let disabledRejected = false;
  try {
    validateModelCatalog({
      models: [
        { ...model("gen", ["candidate-generation"]), enabled: false },
        model("backup", ["candidate-generation"]),
        model("critic", ["style-critique"]),
        model("repair", ["surgical-repair"]),
        model("semantic", ["semantic-verification"]),
        model("extractor", ["semantic-extraction"]),
        { ...model("auditor", ["semantic-extraction"]), enabled: false },
      ],
      routes,
    });
  } catch { disabledRejected = true; }
  assert(disabledRejected, "disabled route model must be rejected");
  return { passed: 6, names: ["accept explicit allowlist", "reject model outside allowlist", "reject task capability mismatch", "reject disabled route model", "require distinct model for independent audit", "reject shared extraction fallback in audit route"] };
}

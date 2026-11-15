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
  const tasks = ["candidate-generation", "style-critique", "surgical-repair", "semantic-verification"] as const;
  const routes = {
    candidateGeneration: { preferredModel: "gen", fallbackModels: ["backup"] },
    styleCritique: { preferredModel: "critic" },
    surgicalRepair: { preferredModel: "repair" },
    semanticVerification: { preferredModel: "semantic" },
  };
  const valid = validateModelCatalog({
    models: [
      model("gen", ["candidate-generation"]),
      model("backup", ["candidate-generation"]),
      model("critic", ["style-critique"]),
      model("repair", ["surgical-repair"]),
      model("semantic", ["semantic-verification"]),
    ],
    routes,
  });
  assert(valid.models.length === 5, "valid explicit catalog must be returned");
  let missingModelRejected = false;
  try {
    validateModelCatalog({ models: [model("gen", tasks)], routes });
  } catch { missingModelRejected = true; }
  assert(missingModelRejected, "unknown route model must be rejected");
  let taskMismatchRejected = false;
  try {
    validateModelCatalog({
      models: [model("gen", tasks), model("backup", ["general"]), model("critic", tasks), model("repair", tasks), model("semantic", tasks)],
      routes,
    });
  } catch { taskMismatchRejected = true; }
  assert(taskMismatchRejected, "route model with incompatible task must be rejected");
  let disabledRejected = false;
  try {
    validateModelCatalog({
      models: [
        { ...model("gen", ["candidate-generation"]), enabled: false },
        model("backup", ["candidate-generation"]),
        model("critic", ["style-critique"]),
        model("repair", ["surgical-repair"]),
        model("semantic", ["semantic-verification"]),
      ],
      routes,
    });
  } catch { disabledRejected = true; }
  assert(disabledRejected, "disabled route model must be rejected");
  return { passed: 4, names: ["accept explicit allowlist", "reject model outside allowlist", "reject task capability mismatch", "reject disabled route model"] };
}

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

  assert(result.completed && result.finalText === sourceText, "approved candidate completes without text mutation");
  assert(!result.repairResult.applied && repairCalls === 0, "critic-approved candidate bypasses repair model");
  assert(semanticCalls === 2, "semantic verifier independently checks before and after states");
  assert(result.verification.passed, "final verification is mandatory for pipeline completion");
  names.push("critic-to-verification orchestration");

  return { passed: names.length, names };
}

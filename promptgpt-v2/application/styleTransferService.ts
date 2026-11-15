import { fingerprintSource } from "../semantic/factInventory";
import { verifyDonorStyleBaseline } from "../style/donorBaseline";
import { generateCandidates, type CandidateModelAdapter } from "../style/candidateGenerator";
import { evaluateCandidate } from "../style/candidateEvaluator";
import { runCriticRepairPipeline } from "../repair/criticRepairPipeline";
import type { StyleCriticAdapter } from "../critic/styleCritic";
import type { SurgicalRepairAdapter } from "../repair/surgicalRepair";
import type { DonorStyleBaseline } from "../style/styleTypes";
import type {
  CandidateOutcome, SemanticVerifier, StyleProfiler, StyleTransferRequest,
  StyleTransferResponse, TransferTraceEvent,
} from "./applicationTypes";

export interface StyleTransferServiceDependencies {
  candidateGenerator: CandidateModelAdapter;
  critic: StyleCriticAdapter;
  repair: SurgicalRepairAdapter;
  semanticVerifier: SemanticVerifier;
  styleProfiler: StyleProfiler;
  now?: () => number;
}

/**
 * Orchestrates generation, semantic-first candidate admission and at most one
 * critic/repair/verification cycle per candidate. Original source and donor
 * baseline are immutable references throughout the request.
 */
export class StyleTransferService {
  private readonly now: () => number;
  constructor(private readonly deps: StyleTransferServiceDependencies) {
    this.now = deps.now ?? Date.now;
  }

  async execute(request: StyleTransferRequest): Promise<StyleTransferResponse> {
    const trace: TransferTraceEvent[] = [];
    const warnings: string[] = [];
    const mark = (stage: TransferTraceEvent["stage"], message: string, candidateId?: string) =>
      trace.push({ stage, at: this.now(), message, candidateId });
    const sourceFingerprint = fingerprintSource(request.sourceText);
    const baselineId = request.donorBaseline.baselineId;
    const emptyGeneration = {
      sourceFingerprint, donorBaselineId: baselineId, requested: 0, generated: 0,
      failed: 0, candidates: [], warnings: [],
    };

    try {
      mark("validating-input", "Проверка неизменности исходника, инвентаря и донорского baseline.");
      if (!request.requestId.trim() || !request.sourceText.trim()) throw new Error("Request ID and source text are required.");
      if (request.inventory.sourceLength !== request.sourceText.length ||
          request.inventory.sourceFingerprint !== sourceFingerprint) {
        throw new Error("Fact inventory does not belong to the exact immutable source text.");
      }
      const baseline = verifyDonorStyleBaseline(request.donorBaseline);
      if (!baseline.valid) throw new Error(baseline.reason ?? "Donor baseline integrity check failed.");
      if (request.signal?.aborted) {
        mark("cancelled", "Запрос отменён до генерации.");
        return {
          requestId: request.requestId, status: "cancelled", sourceFingerprint,
          donorBaselineId: baselineId, generation: emptyGeneration, candidates: [], trace, warnings,
        };
      }

      mark("generating-candidates", "Создание независимых вариантов из одного исходника и одного baseline.");
      const generation = await generateCandidates({
        sourceText: request.sourceText,
        inventory: request.inventory,
        donorBaseline: request.donorBaseline,
        adapter: this.deps.candidateGenerator,
        options: request.generation,
        signal: request.signal,
      });
      warnings.push(...generation.warnings);
      const outcomes: CandidateOutcome[] = [];

      for (const candidate of generation.candidates) {
        if (candidate.status !== "generated" || !candidate.text) continue;
        if (request.signal?.aborted) break;
        mark("evaluating-candidates", "Независимая семантическая и стилевая оценка.", candidate.candidateId);
        const assessments = await this.deps.semanticVerifier.assess({
          sourceText: request.sourceText,
          candidateText: candidate.text,
          propositions: request.inventory.propositions,
          signal: request.signal,
        });
        const profile = this.deps.styleProfiler.analyze(candidate.text);
        const initial = evaluateCandidate({
          candidateId: candidate.candidateId,
          sourceText: request.sourceText,
          outputText: candidate.text,
          inventory: request.inventory,
          propositionAssessments: assessments,
          donorBaseline: request.donorBaseline,
          candidateProfile: profile,
        }, {
          minimumStyleScore: request.minimumStyleScore,
          minimumStyleConfidence: request.minimumStyleConfidence,
          semanticPolicy: request.semanticPolicy,
        });

        if (initial.disposition === "accepted") {
          outcomes.push({
            candidateId: candidate.candidateId, initial, finalText: candidate.text,
            finalEvaluation: initial, repaired: false, warnings: [...initial.warnings],
          });
          continue;
        }

        mark("critic-repair", "Одна ограниченная попытка точечной правки с независимой повторной проверкой.", candidate.candidateId);
        try {
          const pipeline = await runCriticRepairPipeline({
            candidateId: candidate.candidateId,
            sourceText: request.sourceText,
            candidateText: candidate.text,
            inventory: request.inventory,
            donorBaseline: request.donorBaseline,
            criticAdapter: this.deps.critic,
            repairAdapter: this.deps.repair,
            semanticVerifier: {
              assess: ({ sourceText, candidateText, propositions }) =>
                this.deps.semanticVerifier.assess({ sourceText, candidateText, propositions, signal: request.signal }),
            },
            styleProfiler: this.deps.styleProfiler,
            semanticPolicy: request.semanticPolicy,
            signal: request.signal,
          }, {
            critic: request.critic,
            repair: request.repair,
            verification: {
              ...request.verification,
              minimumStyleScore: request.minimumStyleScore ?? request.verification?.minimumStyleScore,
              minimumStyleConfidence: request.minimumStyleConfidence ?? request.verification?.minimumStyleConfidence,
            },
          });
          const finalEvaluation = pipeline.verification.after;
          outcomes.push({
            candidateId: candidate.candidateId,
            initial,
            finalText: pipeline.finalText,
            finalEvaluation,
            repaired: pipeline.repairResult.applied,
            repairPassed: pipeline.completed,
            warnings: [...new Set([...initial.warnings, ...pipeline.warnings])],
          });
        } catch (error) {
          outcomes.push({
            candidateId: candidate.candidateId, initial, finalText: candidate.text,
            finalEvaluation: initial, repaired: false,
            warnings: [error instanceof Error ? error.message : "Critic/repair stage failed."],
          });
        }
      }

      if (request.signal?.aborted) {
        mark("cancelled", "Запрос отменён; уже полученные результаты сохранены.");
        return {
          requestId: request.requestId, status: "cancelled", sourceFingerprint,
          donorBaselineId: baselineId, generation, candidates: outcomes, trace,
          warnings: [...new Set(warnings)],
        };
      }

      const accepted = outcomes
        .filter((item) => item.finalEvaluation.disposition === "accepted" &&
          (!item.repaired || item.repairPassed === true))
        .sort((a, b) => (b.finalEvaluation.styleReport.score ?? -1) - (a.finalEvaluation.styleReport.score ?? -1));
      const review = outcomes.filter((item) => item.finalEvaluation.disposition === "needs-review");
      const selected = accepted[0];
      const status = selected ? "accepted" : review.length ? "needs-review" : "rejected";
      mark("completed", selected ? "Выбран кандидат, прошедший обязательные проверки." : "Нет кандидата, прошедшего все обязательные проверки.");
      for (const item of outcomes) warnings.push(...item.warnings);
      return {
        requestId: request.requestId, status,
        selectedText: selected?.finalText,
        selectedCandidateId: selected?.candidateId,
        sourceFingerprint, donorBaselineId: baselineId,
        generation, candidates: outcomes, trace,
        warnings: [...new Set(warnings)],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown application error.";
      const cancelled = request.signal?.aborted === true;
      mark(cancelled ? "cancelled" : "failed", message);
      return {
        requestId: request.requestId, status: cancelled ? "cancelled" : "rejected",
        sourceFingerprint, donorBaselineId: baselineId,
        generation: emptyGeneration, candidates: [], trace,
        warnings,
        error: { code: cancelled ? "CANCELLED" : "STYLE_TRANSFER_FAILED", message },
      };
    }
  }
}

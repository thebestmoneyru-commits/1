import { fingerprintSource } from "../semantic/factInventory";
import { verifyDonorStyleBaseline } from "../style/donorBaseline";
import { generateCandidates, resolveCandidateCount, type CandidateModelAdapter, type CandidateGenerationResult } from "../style/candidateGenerator";
import { evaluateCandidate } from "../style/candidateEvaluator";
import { validateLogicalRelationAssessments } from "../semantic/logicalRelationPreservation";
import { runCriticRepairPipeline } from "../repair/criticRepairPipeline";
import { buildSemanticRestorationPrompt } from "../repair/semanticRestoration";
import type { StyleCriticAdapter } from "../critic/styleCritic";
import type { SurgicalRepairAdapter } from "../repair/surgicalRepair";
import type { DonorStyleBaseline, StyleDNAProfile } from "../style/styleTypes";
import { DEFAULT_SEMANTIC_POLICY, type PropositionAssessment } from "../types";
import type { LogicalRelationAssessment } from "../semantic/logicalRelationPreservation";
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

      mark("generating-candidates", "Последовательное создание независимых вариантов; дополнительные варианты запрашиваются только при необходимости.");
      const generation: CandidateGenerationResult = {
        sourceFingerprint, donorBaselineId: baselineId, requested: 0, generated: 0,
        failed: 0, candidates: [], warnings: [],
      };
      const outcomes: CandidateOutcome[] = [];
      const adaptive = request.generation?.adaptive !== false;
      const candidateLimit = resolveCandidateCount(request.generation);
      const candidateBatches: Array<number | null> = adaptive
        ? Array.from({ length: candidateLimit }, (_, index) => index)
        : [null];

      candidateLoop: for (const candidateIndex of candidateBatches) {
        if (request.signal?.aborted) break;
        const batch = await generateCandidates({
          sourceText: request.sourceText,
          inventory: request.inventory,
          donorBaseline: request.donorBaseline,
          adapter: this.deps.candidateGenerator,
          options: adaptive
            ? { ...request.generation, candidateCount: 1, concurrency: 1 }
            : request.generation,
          candidateStartIndex: candidateIndex ?? 0,
          signal: request.signal,
        });
        generation.requested += batch.requested;
        generation.generated += batch.generated;
        generation.failed += batch.failed;
        generation.candidates.push(...batch.candidates);
        generation.warnings.push(...batch.warnings);
        warnings.push(...batch.warnings);

        for (const candidate of batch.candidates) {
        if (candidate.status !== "generated" || !candidate.text) continue;
        if (request.signal?.aborted) break;
        mark("evaluating-candidates", "Независимая семантическая и стилевая оценка.", candidate.candidateId);
        let assessments: PropositionAssessment[];
        let relationAssessments: LogicalRelationAssessment[];
        let structureReport: ReturnType<typeof validateLogicalRelationAssessments>;
        let profile: StyleDNAProfile;
        try {
          if (this.deps.semanticVerifier.assessCombined) {
            const combined = await this.deps.semanticVerifier.assessCombined({
              sourceText: request.sourceText,
              candidateText: candidate.text,
              propositions: request.inventory.propositions,
              signal: request.signal,
            });
            assessments = combined.propositionAssessments;
            relationAssessments = combined.relationAssessments;
          } else {
            const [propositionAssessments, checkedRelationAssessments] = await Promise.all([
              this.deps.semanticVerifier.assess({
                sourceText: request.sourceText,
                candidateText: candidate.text,
                propositions: request.inventory.propositions,
                signal: request.signal,
              }),
              this.deps.semanticVerifier.assessRelations({
                sourceText: request.sourceText,
                candidateText: candidate.text,
                propositions: request.inventory.propositions,
                signal: request.signal,
              }),
            ]);
            assessments = propositionAssessments;
            relationAssessments = checkedRelationAssessments;
          }
          structureReport = validateLogicalRelationAssessments(
            candidate.text, request.inventory.propositions, relationAssessments,
            request.semanticPolicy?.minimumAssessmentConfidence ?? DEFAULT_SEMANTIC_POLICY.minimumAssessmentConfidence,
          );
          if (request.signal?.aborted) break;
          profile = this.deps.styleProfiler.analyze(candidate.text);
        } catch (error) {
          if (request.signal?.aborted) break;
          warnings.push(`Кандидат ${candidate.candidateId} пропущен: ошибка независимой проверки — ${error instanceof Error ? error.message : "неизвестная ошибка"}.`);
          continue;
        }
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

        if (!structureReport.passed) {
          initial.semanticReport.passed = false;
          initial.semanticReport.issues.push({
            code: "LOGICAL_RELATION_NOT_PRESERVED", severity: "error",
            message: structureReport.issues.join(" "),
          });
          initial.disposition = "rejected";
          initial.admissible = false;
          initial.rejectionReasons.push("Кандидат не сохранил исходную логическую структуру.");
        }

        let currentText = candidate.text;
        let currentAssessments = assessments;
        let currentRelationAssessments = relationAssessments;
        let currentProfile = profile;
        let currentEvaluation = initial;
        let semanticRestorationApplied = false;
        const restorationWarnings: string[] = [];
        const hasRestorableDefects =
          assessments.some((item) => item.status !== "preserved") ||
          relationAssessments.some((item) => item.status !== "preserved") ||
          initial.semanticReport.anchorChecks.some((item) => item.status === "missing");

        // A single content-restoration pass is allowed before style-only repair.
        // It is triggered only by concrete verifier findings, never by a missing report.
        if (!initial.semanticReport.passed && hasRestorableDefects) {
          mark("semantic-repair", "Одна ограниченная попытка восстановить пропущенные смысловые элементы с последующей независимой проверкой.", candidate.candidateId);
          try {
            const prompt = buildSemanticRestorationPrompt({
              sourceText: request.sourceText,
              candidateText: currentText,
              inventory: request.inventory,
              propositionAssessments: currentAssessments,
              relationAssessments: currentRelationAssessments,
              semanticReport: currentEvaluation.semanticReport,
            });
            const restoredText = (await this.deps.candidateGenerator.generate({
              prompt,
              candidateIndex: candidate.candidateIndex,
              signal: request.signal,
            })).trim();

            if (!restoredText || restoredText === currentText) {
              restorationWarnings.push("Восстановление содержания не изменило текст; исходный кандидат оставлен без изменений.");
            } else {
              let restoredAssessments: PropositionAssessment[];
              let restoredRelations: LogicalRelationAssessment[];
              if (this.deps.semanticVerifier.assessCombined) {
                const restored = await this.deps.semanticVerifier.assessCombined({
                  sourceText: request.sourceText,
                  candidateText: restoredText,
                  propositions: request.inventory.propositions,
                  signal: request.signal,
                });
                restoredAssessments = restored.propositionAssessments;
                restoredRelations = restored.relationAssessments;
              } else {
                const [propositionResult, relationResult] = await Promise.all([
                  this.deps.semanticVerifier.assess({
                    sourceText: request.sourceText,
                    candidateText: restoredText,
                    propositions: request.inventory.propositions,
                    signal: request.signal,
                  }),
                  this.deps.semanticVerifier.assessRelations({
                    sourceText: request.sourceText,
                    candidateText: restoredText,
                    propositions: request.inventory.propositions,
                    signal: request.signal,
                  }),
                ]);
                restoredAssessments = propositionResult;
                restoredRelations = relationResult;
              }

              const restoredStructure = validateLogicalRelationAssessments(
                restoredText, request.inventory.propositions, restoredRelations,
                request.semanticPolicy?.minimumAssessmentConfidence ?? DEFAULT_SEMANTIC_POLICY.minimumAssessmentConfidence,
              );
              const restoredProfile = this.deps.styleProfiler.analyze(restoredText);
              const restoredEvaluation = evaluateCandidate({
                candidateId: candidate.candidateId,
                sourceText: request.sourceText,
                outputText: restoredText,
                inventory: request.inventory,
                propositionAssessments: restoredAssessments,
                donorBaseline: request.donorBaseline,
                candidateProfile: restoredProfile,
              }, {
                minimumStyleScore: request.minimumStyleScore,
                minimumStyleConfidence: request.minimumStyleConfidence,
                semanticPolicy: request.semanticPolicy,
              });

              if (!restoredStructure.passed) {
                restoredEvaluation.semanticReport.passed = false;
                restoredEvaluation.semanticReport.issues.push({
                  code: "LOGICAL_RELATION_NOT_PRESERVED", severity: "error",
                  message: restoredStructure.issues.join(" "),
                });
                restoredEvaluation.disposition = "rejected";
                restoredEvaluation.admissible = false;
                restoredEvaluation.rejectionReasons.push("После восстановления содержания логическая структура всё ещё не подтверждена.");
              }

              if (restoredEvaluation.semanticReport.passed) {
                currentText = restoredText;
                currentAssessments = restoredAssessments;
                currentRelationAssessments = restoredRelations;
                currentProfile = restoredProfile;
                currentEvaluation = restoredEvaluation;
                semanticRestorationApplied = true;
              } else {
                restorationWarnings.push("Попытка восстановления не прошла повторную проверку смысла; исходный кандидат не принят.");
              }
            }
          } catch (error) {
            restorationWarnings.push(`Не удалось восстановить содержание кандидата: ${error instanceof Error ? error.message : "неизвестная ошибка"}.`);
          }
        }

        if (currentEvaluation.disposition === "accepted") {
          outcomes.push({
            candidateId: candidate.candidateId,
            initial,
            finalText: currentText,
            finalEvaluation: currentEvaluation,
            repaired: semanticRestorationApplied,
            repairPassed: semanticRestorationApplied ? true : undefined,
            warnings: [...new Set([...initial.warnings, ...restorationWarnings, ...currentEvaluation.warnings])],
          });
          if (adaptive) break candidateLoop;
          continue;
        }

        // Style critique is only allowed after semantic preservation has passed.
        if (!currentEvaluation.semanticReport.passed) {
          outcomes.push({
            candidateId: candidate.candidateId,
            initial,
            finalText: candidate.text,
            finalEvaluation: initial,
            repaired: false,
            warnings: [...new Set([
              ...initial.warnings,
              ...restorationWarnings,
              "Стилистическая правка пропущена: кандидат не прошёл обязательную проверку сохранности смысла.",
            ])],
          });
          continue;
        }

        mark("critic-repair", "Одна ограниченная попытка точечной правки с независимой повторной проверкой.", candidate.candidateId);
        try {
          const pipeline = await runCriticRepairPipeline({
            candidateId: candidate.candidateId,
            sourceText: request.sourceText,
            candidateText: currentText,
            inventory: request.inventory,
            donorBaseline: request.donorBaseline,
            criticAdapter: this.deps.critic,
            repairAdapter: this.deps.repair,
            semanticVerifier: {
              ...(this.deps.semanticVerifier.assessCombined ? {
                assessCombined: ({ sourceText, candidateText, propositions }) =>
                  this.deps.semanticVerifier.assessCombined!({ sourceText, candidateText, propositions, signal: request.signal }),
              } : {}),
              assess: ({ sourceText, candidateText, propositions }) =>
                this.deps.semanticVerifier.assess({ sourceText, candidateText, propositions, signal: request.signal }),
              assessRelations: ({ sourceText, candidateText, propositions }) =>
                this.deps.semanticVerifier.assessRelations({ sourceText, candidateText, propositions, signal: request.signal }),
            },
            styleProfiler: this.deps.styleProfiler,
            semanticPolicy: request.semanticPolicy,
            signal: request.signal,
            initialVerification: {
              propositionAssessments: currentAssessments,
              relationAssessments: currentRelationAssessments,
              styleProfile: currentProfile,
            },
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
            repaired: semanticRestorationApplied || pipeline.repairResult.applied,
            repairPassed: pipeline.completed,
            warnings: [...new Set([...initial.warnings, ...restorationWarnings, ...pipeline.warnings])],
          });
          if (adaptive && pipeline.completed && finalEvaluation.disposition === "accepted") {
            break candidateLoop;
          }
        } catch (error) {
          outcomes.push({
            candidateId: candidate.candidateId, initial, finalText: currentText,
            finalEvaluation: currentEvaluation, repaired: semanticRestorationApplied,
            repairPassed: false,
            warnings: [...restorationWarnings, error instanceof Error ? error.message : "Critic/repair stage failed."],
          });
        }
      }
      }
      generation.warnings = [...new Set(generation.warnings)];

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

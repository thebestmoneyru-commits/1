import { fingerprintSource } from "../semantic/factInventory";
import { verifyDonorStyleBaseline } from "../style/donorBaseline";
import {
  buildCompactRecoveryPrompt,
  generateCandidates,
  resolveCandidateCount,
  type CandidateModelAdapter,
  type CandidateGenerationResult,
} from "../style/candidateGenerator";
import { evaluateCandidate, type CandidateEvaluationResult } from "../style/candidateEvaluator";
import { computeWordTrigramOverlap } from "../style/textOverlap";
import { scoreStyleDNA } from "../style/styleDNAScorer";
import { buildAdvancedDiagnostics } from "../style/advancedDiagnostics";
import { buildDnaDiagnostics40 } from "../style/dnaDiagnostics40";
import type { StageScoreDelta } from "../style/diagnosticsTypes";
import { validateLogicalRelationAssessments } from "../semantic/logicalRelationPreservation";
import { SEMANTIC_VERIFICATION_VERSION } from "../semantic/semanticPreservation";
import { runCriticRepairPipeline } from "../repair/criticRepairPipeline";
import { buildSemanticRestorationPrompt } from "../repair/semanticRestoration";
import type { StyleCriticAdapter } from "../critic/styleCritic";
import type { SurgicalRepairAdapter } from "../repair/surgicalRepair";
import type { DonorStyleBaseline, StyleDNAProfile } from "../style/styleTypes";
import { DEFAULT_SEMANTIC_POLICY, type PropositionAssessment } from "../types";
import type { LogicalRelationAssessment } from "../semantic/logicalRelationPreservation";
import type {
  ModelCallDiagnostic,
  SelectionDiagnostics,
  CandidateDiagnosticStep,
  CandidateOutcome,
  PromptResultHistoryEntry,
  SemanticVerifier,
  StagePromptRecord,
  StyleProfiler,
  StyleTransferRequest,
  StyleTransferResponse,
  TransferTraceEvent,
} from "./applicationTypes";

export interface StyleTransferServiceDependencies {
  candidateGenerator: CandidateModelAdapter;
  critic: StyleCriticAdapter;
  repair: SurgicalRepairAdapter;
  semanticVerifier: SemanticVerifier;
  styleProfiler: StyleProfiler;
  defaultRequestOptions?: Partial<
    Pick<
      StyleTransferRequest,
      | "generation"
      | "semanticPolicy"
      | "minimumStyleScore"
      | "minimumStyleConfidence"
      | "criticPolishThreshold"
      | "critic"
      | "repair"
      | "verification"
      | "enableCompactRecovery"
    >
  >;
  getSignalDiagnostics?: (signal?: AbortSignal) =>
    | {
        requestedModel?: string;
        usedModel?: string;
        fallbackOccurred?: boolean;
        warnings?: readonly string[];
        modelCalls?: ModelCallDiagnostic[];
      }
    | undefined;
  now?: () => number;
}

async function runWithTimeoutRetry<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal,
  delayMs = 1500,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const retryable =
      !signal?.aborted &&
      /timed out|timeout|500|502|503|504|UNAVAILABLE|OVERLOADED|ECONNRESET|NETWORK|HIGH DEMAND/i.test(msg);
    if (!retryable) throw err;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, delayMs);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
    if (signal?.aborted) throw err;
    return await fn();
  }
}

export class StyleTransferService {
  private readonly now: () => number;

  constructor(private readonly deps: StyleTransferServiceDependencies) {
    this.now = deps.now ?? Date.now;
  }

  async execute(rawRequest: StyleTransferRequest): Promise<StyleTransferResponse> {
    const startedAt = this.now();
    const defaults = this.deps.defaultRequestOptions;
    const request: StyleTransferRequest = defaults
      ? {
          ...defaults,
          ...rawRequest,
          generation:
            defaults.generation || rawRequest.generation
              ? { ...defaults.generation, ...rawRequest.generation }
              : undefined,
          critic:
            defaults.critic || rawRequest.critic
              ? { ...defaults.critic, ...rawRequest.critic }
              : undefined,
          repair:
            defaults.repair || rawRequest.repair
              ? { ...defaults.repair, ...rawRequest.repair }
              : undefined,
          verification:
            defaults.verification || rawRequest.verification
              ? { ...defaults.verification, ...rawRequest.verification }
              : undefined,
        }
      : rawRequest;

    const unfilteredMode = request.unfilteredMode === true;
    // Production style-transfer mode must never accept a candidate below the established 76/100 floor.
    // The explicit unfiltered mode remains a separate, intentionally non-gating workflow.
    const requestedMinimumStyleScore = Number.isFinite(request.minimumStyleScore)
      ? request.minimumStyleScore!
      : 76;
    const minimumStyleScore = Math.max(76, Math.min(100, requestedMinimumStyleScore));
    const styleTargetScore = Math.max(request.criticPolishThreshold ?? 80, minimumStyleScore);
    const trace: TransferTraceEvent[] = [];
    const stagePrompts: StagePromptRecord[] = [];
    const warnings: string[] = [
      ...(request.preparationWarnings ?? []),
      ...(unfilteredMode
        ? ["Режим без фильтрации: все проверки семантической интерпретации и семантические аудиты отключены."]
        : []),
    ];
    const mark = (stage: TransferTraceEvent["stage"], message: string, candidateId?: string) => {
      const at = this.now();
      trace.push({ stage, at, elapsedMs: Math.max(0, at - startedAt), message, candidateId });
    };

    const sourceFingerprint = fingerprintSource(request.sourceText);
    const baselineId = request.donorBaseline.baselineId;
    const emptyGeneration: CandidateGenerationResult = {
      sourceFingerprint,
      donorBaselineId: baselineId,
      requested: 0,
      generated: 0,
      failed: 0,
      candidates: [],
      warnings: [],
    };

    try {
      mark(
        "validating-input",
        unfilteredMode
          ? "Подготовка в режиме без фильтрации (семантические проверки и аудиты отключены)."
          : "Проверка неизменности исходника, инвентаря и донорского baseline.",
      );
      if (!request.requestId.trim() || !request.sourceText.trim()) {
        throw new Error("Request ID and source text are required.");
      }
      if (
        request.inventory.sourceLength !== request.sourceText.length ||
        request.inventory.sourceFingerprint !== sourceFingerprint
      ) {
        throw new Error("Fact inventory does not belong to the exact immutable source text.");
      }
      const baseline = verifyDonorStyleBaseline(request.donorBaseline);
      if (!baseline.valid) {
        throw new Error(baseline.reason ?? "Donor baseline integrity check failed.");
      }
      if (request.signal?.aborted) {
        mark("cancelled", "Запрос отменён до генерации.");
        return {
          requestId: request.requestId,
          status: "cancelled",
          totalDurationMs: Math.max(0, this.now() - startedAt),
          stagePrompts,
          sourceFingerprint,
          donorBaselineId: baselineId,
          generation: emptyGeneration,
          candidates: [],
          trace,
          warnings,
        };
      }

      mark(
        "generating-candidates",
        "Последовательное создание независимых вариантов; дополнительные варианты запрашиваются при необходимости улучшения стиля.",
      );
      const generation: CandidateGenerationResult = {
        sourceFingerprint,
        donorBaselineId: baselineId,
        requested: 0,
        generated: 0,
        failed: 0,
        candidates: [],
        warnings: [],
      };
      const outcomes: CandidateOutcome[] = [];
      const adaptive = request.generation?.adaptive !== false;
      const candidateLimit = resolveCandidateCount(request.generation);
      const candidateBatches: Array<{ candidateStartIndex: number; compactRecovery?: boolean }> = adaptive
        ? Array.from({ length: candidateLimit }, (_, index) => ({ candidateStartIndex: index }))
        : [{ candidateStartIndex: 0 }];
      let compactRecoveryAttempted = false;

      candidateLoop: for (let batchPos = 0; batchPos < candidateBatches.length; batchPos++) {
        const batchSpec = candidateBatches[batchPos];
        if (request.signal?.aborted) break;

        const generationStartedAt = this.now();
        let batch: CandidateGenerationResult;
        if (batchSpec.compactRecovery) {
          await new Promise<void>((resolve) => {
            if (request.signal?.aborted) return resolve();
            const timer = setTimeout(resolve, 2_500);
            request.signal?.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                resolve();
              },
              { once: true },
            );
          });
          if (request.signal?.aborted) break;

          const recoveryPrompt = buildCompactRecoveryPrompt({
            sourceText: request.sourceText,
            donorBaseline: request.donorBaseline,
            styleIntensity: (request.generation?.styleIntensity ?? 4) as 1 | 2 | 3 | 4 | 5,
            customInstructions: request.generation?.customInstructions,
          });
          const recoveryId = `candidate-${batchSpec.candidateStartIndex + 1}`;
          const promptCreatedAt = this.now();
          try {
            const recoveredText = (
              await runWithTimeoutRetry(
                () =>
                  this.deps.candidateGenerator.generate({
                    prompt: recoveryPrompt,
                    candidateIndex: batchSpec.candidateStartIndex,
                    signal: request.signal,
                  }),
                request.signal,
              )
            ).trim();
            stagePrompts.push({
              stage: "compact-recovery",
              candidateId: recoveryId,
              prompt: recoveryPrompt,
              createdAt: promptCreatedAt,
              durationMs: Math.max(0, this.now() - promptCreatedAt),
            });
            if (!recoveredText) throw new Error("Модель вернула пустой текст.");
            batch = {
              sourceFingerprint,
              donorBaselineId: baselineId,
              requested: 1,
              generated: 1,
              failed: 0,
              candidates: [
                {
                  candidateId: recoveryId,
                  candidateIndex: batchSpec.candidateStartIndex,
                  status: "generated",
                  text: recoveredText,
                  sourceFingerprint,
                  donorBaselineId: baselineId,
                },
              ],
              warnings: ["Применена компактная восстановительная генерация после временного сбоя основных попыток."],
            };
          } catch (recoveryError) {
            stagePrompts.push({
              stage: "compact-recovery",
              candidateId: recoveryId,
              prompt: recoveryPrompt,
              createdAt: promptCreatedAt,
              durationMs: Math.max(0, this.now() - promptCreatedAt),
            });
            const msg =
              recoveryError instanceof Error ? recoveryError.message : "Неизвестная ошибка восстановительной генерации.";
            batch = {
              sourceFingerprint,
              donorBaselineId: baselineId,
              requested: 1,
              generated: 0,
              failed: 1,
              candidates: [
                {
                  candidateId: recoveryId,
                  candidateIndex: batchSpec.candidateStartIndex,
                  status: "failed",
                  error: msg,
                  sourceFingerprint,
                  donorBaselineId: baselineId,
                },
              ],
              warnings: [`Восстановительная компактная генерация не удалась (${msg}).`],
            };
          }
        } else {
          const capturingAdapter: CandidateModelAdapter = {
            generate: async (req) => {
              const pAt = this.now();
              const out = await this.deps.candidateGenerator.generate(req);
              stagePrompts.push({
                stage: "candidate-generation",
                candidateId: `candidate-${req.candidateIndex + 1}`,
                prompt: req.prompt,
                createdAt: pAt,
                durationMs: Math.max(0, this.now() - pAt),
              });
              return out;
            },
          };
          batch = await generateCandidates({
            sourceText: request.sourceText,
            inventory: request.inventory,
            donorBaseline: request.donorBaseline,
            adapter: capturingAdapter,
            options: adaptive ? { ...request.generation, candidateCount: 1, concurrency: 1 } : request.generation,
            candidateStartIndex: batchSpec.candidateStartIndex,
            signal: request.signal,
          });
        }

        const generationDurationMs = Math.max(0, this.now() - generationStartedAt);
        generation.requested += batch.requested;
        generation.generated += batch.generated;
        generation.failed += batch.failed;
        generation.candidates.push(...batch.candidates);
        generation.warnings.push(...batch.warnings);
        warnings.push(...batch.warnings);

        for (const candidate of batch.candidates) {
          if (candidate.status !== "generated" || !candidate.text) continue;
          if (request.signal?.aborted) break;

          const candidatePrompt =
            [...stagePrompts]
              .reverse()
              .find((p) => p.candidateId === candidate.candidateId)?.prompt;

          const diagnosticSteps: CandidateDiagnosticStep[] = [
            {
              stage: "candidate-generation",
              status: "completed",
              detail: "Модель создала текст кандидата: " + candidate.text.length + " символов.",
              durationMs: generationDurationMs,
            },
          ];

          if (unfilteredMode) {
            const styleProfilingStartedAt = this.now();
            const profile = this.deps.styleProfiler.analyze(candidate.text);
            const styleProfilingDurationMs = Math.max(0, this.now() - styleProfilingStartedAt);
            const styleScoringStartedAt = this.now();
            const styleReport = scoreStyleDNA(request.donorBaseline.profile, profile);
            const styleScoringDurationMs = Math.max(0, this.now() - styleScoringStartedAt);
            const requiredAnchorsTotal = request.inventory.anchors.filter((anchor) => anchor.required).length;
            const mandatoryPropositionsTotal = request.inventory.propositions.filter((prop) => prop.mandatory).length;
            const initial: CandidateEvaluationResult = {
              candidateId: candidate.candidateId,
              disposition: "accepted",
              admissible: true,
              donorBaselineId: request.donorBaseline.baselineId,
              semanticReport: {
                passed: true,
                sourceLength: request.sourceText.length,
                outputLength: candidate.text.length,
                anchorChecks: [],
                propositionAssessments: [],
                issues: [],
                requiredAnchorsFound: requiredAnchorsTotal,
                requiredAnchorsTotal,
                mandatoryPropositionsPreserved: mandatoryPropositionsTotal,
                mandatoryPropositionsTotal,
                verificationVersion: SEMANTIC_VERIFICATION_VERSION,
              },
              styleReport,
              rejectionReasons: [],
              warnings: [...styleReport.warnings],
            };
            const diagnostics = buildAdvancedDiagnostics({
              sourceText: request.sourceText,
              finalText: candidate.text,
              candidateProfile: profile,
              styleReport,
              latency: {
                candidateGenerationMs: generationDurationMs,
                styleProfilingMs: styleProfilingDurationMs,
                styleScoringMs: styleScoringDurationMs,
              },
            });
            diagnosticSteps.push(
              {
                stage: "semantic-verification",
                status: "skipped",
                detail: "Отключено: активен «Режим без фильтрации».",
                durationMs: 0,
              },
              {
                stage: "logical-structure",
                status: "skipped",
                detail: "Отключено: активен «Режим без фильтрации».",
                durationMs: 0,
              },
              {
                stage: "style-profiling",
                status: "completed",
                detail:
                  "Профиль кандидата построен: " +
                  profile.corpus.words +
                  " слов, " +
                  profile.corpus.sentences +
                  " предложений, " +
                  profile.features.length +
                  " признаков; статус " +
                  profile.status +
                  ".",
                durationMs: styleProfilingDurationMs,
              },
              {
                stage: "style-scoring",
                status: styleReport.status === "scored" ? "completed" : "not-completed",
                detail:
                  styleReport.status === "scored"
                    ? "Оценка " +
                      styleReport.score +
                      "/100; уверенность " +
                      styleReport.confidence +
                      "; сравнено признаков: " +
                      styleReport.comparisons.length +
                      "."
                    : "Оценка не рассчитана: " + styleReport.status + ". " + styleReport.warnings.join(" "),
                durationMs: styleScoringDurationMs,
              },
              {
                stage: "semantic-restoration",
                status: "skipped",
                detail: "Отключено: активен «Режим без фильтрации».",
                durationMs: 0,
              },
              {
                stage: "style-critic-repair",
                status: "skipped",
                detail: "Отключено: активен «Режим без фильтрации» (повторные семантические проверки отключены).",
                durationMs: 0,
              },
              {
                stage: "final-decision",
                status: "completed",
                detail: "Кандидат принят без фильтрации.",
              },
            );
            outcomes.push({
              candidateId: candidate.candidateId,
              initial,
              finalText: candidate.text,
              finalEvaluation: initial,
              repaired: false,
              usedPrompt: candidatePrompt,
              diagnosticSteps,
              diagnostics,
              warnings: [...initial.warnings],
            });
            const polishGoal = request.criticPolishThreshold ?? 85;
            if (adaptive && styleReport.status === "scored" && (styleReport.score ?? 0) >= polishGoal) {
              break candidateLoop;
            }
            continue;
          }

          mark("evaluating-candidates", "Независимая семантическая и стилевая оценка.", candidate.candidateId);
          let assessments: PropositionAssessment[];
          let relationAssessments: LogicalRelationAssessment[];
          let structureReport: ReturnType<typeof validateLogicalRelationAssessments>;
          let profile: StyleDNAProfile;
          let semanticVerificationDurationMs = 0;
          let logicalStructureDurationMs = 0;
          let styleProfilingDurationMs = 0;

          try {
            const semanticVerificationStartedAt = this.now();
            if (this.deps.semanticVerifier.assessCombined) {
              const combined = await runWithTimeoutRetry(
                () =>
                  this.deps.semanticVerifier.assessCombined!({
                    sourceText: request.sourceText,
                    candidateText: candidate.text!,
                    propositions: request.inventory.propositions,
                    signal: request.signal,
                  }),
                request.signal,
              );
              assessments = combined.propositionAssessments;
              relationAssessments = combined.relationAssessments;
            } else {
              const [propositionAssessments, checkedRelationAssessments] = await Promise.all([
                runWithTimeoutRetry(
                  () =>
                    this.deps.semanticVerifier.assess({
                      sourceText: request.sourceText,
                      candidateText: candidate.text!,
                      propositions: request.inventory.propositions,
                      signal: request.signal,
                    }),
                  request.signal,
                ),
                runWithTimeoutRetry(
                  () =>
                    this.deps.semanticVerifier.assessRelations({
                      sourceText: request.sourceText,
                      candidateText: candidate.text!,
                      propositions: request.inventory.propositions,
                      signal: request.signal,
                    }),
                  request.signal,
                ),
              ]);
              assessments = propositionAssessments;
              relationAssessments = checkedRelationAssessments;
            }
            semanticVerificationDurationMs = Math.max(0, this.now() - semanticVerificationStartedAt);

            const logicalStructureStartedAt = this.now();
            structureReport = validateLogicalRelationAssessments(
              candidate.text,
              request.inventory.propositions,
              relationAssessments,
              request.semanticPolicy?.minimumAssessmentConfidence ?? DEFAULT_SEMANTIC_POLICY.minimumAssessmentConfidence,
            );
            logicalStructureDurationMs = Math.max(0, this.now() - logicalStructureStartedAt);

            if (request.signal?.aborted) break;
            const styleProfilingStartedAt = this.now();
            profile = this.deps.styleProfiler.analyze(candidate.text);
            styleProfilingDurationMs = Math.max(0, this.now() - styleProfilingStartedAt);
          } catch (error) {
            if (request.signal?.aborted) break;
            const verifierErr = error instanceof Error ? error.message : "неизвестная ошибка";
            const warningMsg = `Независимая семантическая проверка для ${candidate.candidateId} не завершилась (${verifierErr}); кандидат сохранён для ручного просмотра со стилевой оценкой.`;
            warnings.push(warningMsg);

            const styleProfilingStartedAt = this.now();
            const fallbackProfile = this.deps.styleProfiler.analyze(candidate.text);
            const fallbackStyleProfilingMs = Math.max(0, this.now() - styleProfilingStartedAt);
            const styleScoringStartedAt = this.now();
            const fallbackStyleReport = scoreStyleDNA(request.donorBaseline.profile, fallbackProfile);
            const fallbackStyleScoringMs = Math.max(0, this.now() - styleScoringStartedAt);
            const requiredAnchorsTotal = request.inventory.anchors.filter((anchor) => anchor.required).length;
            const mandatoryPropositionsTotal = request.inventory.propositions.filter((prop) => prop.mandatory).length;
            const fallbackEvaluation: CandidateEvaluationResult = {
              candidateId: candidate.candidateId,
              disposition: "needs-review",
              admissible: false,
              donorBaselineId: request.donorBaseline.baselineId,
              semanticReport: {
                passed: false,
                sourceLength: request.sourceText.length,
                outputLength: candidate.text.length,
                anchorChecks: [],
                propositionAssessments: [],
                issues: [
                  {
                    code: "PROPOSITION_UNCERTAIN",
                    severity: "warning",
                    message: verifierErr,
                  },
                ],
                requiredAnchorsFound: 0,
                requiredAnchorsTotal,
                mandatoryPropositionsPreserved: 0,
                mandatoryPropositionsTotal,
                verificationVersion: SEMANTIC_VERIFICATION_VERSION,
              },
              styleReport: fallbackStyleReport,
              rejectionReasons: [warningMsg],
              warnings: [...fallbackStyleReport.warnings, warningMsg],
            };
            const diagnostics = buildAdvancedDiagnostics({
              sourceText: request.sourceText,
              finalText: candidate.text,
              candidateProfile: fallbackProfile,
              styleReport: fallbackStyleReport,
              latency: {
                candidateGenerationMs: generationDurationMs,
                styleProfilingMs: fallbackStyleProfilingMs,
                styleScoringMs: fallbackStyleScoringMs,
              },
            });
            diagnosticSteps.push(
              {
                stage: "semantic-verification",
                status: "not-completed",
                detail: `Не завершено из-за сбоя проверки: ${verifierErr}`,
              },
              {
                stage: "logical-structure",
                status: "not-completed",
                detail: "Пропущено из-за незавершённой семантической проверки.",
              },
              {
                stage: "style-profiling",
                status: "completed",
                detail: `Профиль кандидата построен: ${fallbackProfile.corpus.words} слов, ${fallbackProfile.corpus.sentences} предложений, ${fallbackProfile.features.length} признаков; статус ${fallbackProfile.status}.`,
                durationMs: fallbackStyleProfilingMs,
              },
              {
                stage: "style-scoring",
                status: fallbackStyleReport.status === "scored" ? "completed" : "not-completed",
                detail:
                  fallbackStyleReport.status === "scored"
                    ? `Оценка ${fallbackStyleReport.score}/100; уверенность ${fallbackStyleReport.confidence}; сравнено признаков: ${fallbackStyleReport.comparisons.length}.`
                    : `Оценка не рассчитана: ${fallbackStyleReport.status}. ${fallbackStyleReport.warnings.join(" ")}`,
                durationMs: fallbackStyleScoringMs,
              },
              {
                stage: "semantic-restoration",
                status: "skipped",
                detail: "Не запускалось: отсутствует отчёт семантической проверки.",
              },
              {
                stage: "style-critic-repair",
                status: "skipped",
                detail: "Не запускалось: отсутствует отчёт семантической проверки.",
              },
              {
                stage: "final-decision",
                status: "completed",
                detail: "Кандидат выдан в статусе needs-review (с полной стилевой оценкой без блокировки).",
              },
            );
            outcomes.push({
              candidateId: candidate.candidateId,
              initial: fallbackEvaluation,
              finalText: candidate.text,
              finalEvaluation: fallbackEvaluation,
              repaired: false,
              usedPrompt: candidatePrompt,
              diagnosticSteps,
              diagnostics,
              warnings: [...fallbackEvaluation.warnings],
            });
            if (adaptive && fallbackStyleReport.status === "scored" && (fallbackStyleReport.score ?? 0) >= styleTargetScore) {
              break candidateLoop;
            }
            continue;
          }

          const styleScoringStartedAt = this.now();
          const initial = evaluateCandidate(
            {
              candidateId: candidate.candidateId,
              sourceText: request.sourceText,
              outputText: candidate.text,
              inventory: request.inventory,
              propositionAssessments: assessments,
              donorBaseline: request.donorBaseline,
              candidateProfile: profile,
            },
            {
              minimumStyleScore,
              minimumStyleConfidence: request.minimumStyleConfidence,
              semanticPolicy: request.semanticPolicy,
            },
          );
          const styleScoringDurationMs = Math.max(0, this.now() - styleScoringStartedAt);

          if (!structureReport.passed) {
            initial.semanticReport.passed = false;
            initial.semanticReport.issues.push({
              code: "LOGICAL_RELATION_NOT_PRESERVED",
              severity: "error",
              message: structureReport.issues.join(" "),
            });
            initial.disposition = "rejected";
            initial.admissible = false;
            initial.rejectionReasons.push("Кандидат не сохранил исходную логическую структуру.");
          }

          diagnosticSteps.push(
            {
              stage: "semantic-verification",
              status: initial.semanticReport.passed ? "completed" : "failed",
              detail:
                "Обязательные утверждения: " +
                initial.semanticReport.mandatoryPropositionsPreserved +
                "/" +
                initial.semanticReport.mandatoryPropositionsTotal +
                "; якоря: " +
                initial.semanticReport.requiredAnchorsFound +
                "/" +
                initial.semanticReport.requiredAnchorsTotal +
                ".",
              durationMs: semanticVerificationDurationMs,
            },
            {
              stage: "logical-structure",
              status: structureReport.passed ? "completed" : "failed",
              detail: structureReport.passed
                ? "Логические отношения проверены: " + relationAssessments.length + "."
                : structureReport.issues.join(" "),
              durationMs: logicalStructureDurationMs,
            },
            {
              stage: "style-profiling",
              status: "completed",
              detail:
                "Профиль кандидата построен: " +
                profile.corpus.words +
                " слов, " +
                profile.corpus.sentences +
                " предложений, " +
                profile.features.length +
                " признаков; статус " +
                profile.status +
                ".",
              durationMs: styleProfilingDurationMs,
            },
            {
              stage: "style-scoring",
              status: initial.styleReport.status === "scored" ? "completed" : "not-completed",
              detail:
                initial.styleReport.status === "scored"
                  ? "Оценка " +
                    initial.styleReport.score +
                    "/100; уверенность " +
                    initial.styleReport.confidence +
                    "; сравнено признаков: " +
                    initial.styleReport.comparisons.length +
                    "."
                  : "Оценка не рассчитана: " + initial.styleReport.status + ". " + initial.styleReport.warnings.join(" "),
              durationMs: styleScoringDurationMs,
            },
          );

          let currentText = candidate.text;
          let currentAssessments = assessments;
          let currentRelationAssessments = relationAssessments;
          let currentProfile = profile;
          let currentEvaluation = initial;
          let semanticRestorationApplied = false;
          const restorationWarnings: string[] = [];
          const stageDeltas: StageScoreDelta[] = [];
          const hasRestorableDefects =
            assessments.some((item) => item.status !== "preserved") ||
            relationAssessments.some((item) => item.status !== "preserved") ||
            !structureReport.passed ||
            initial.semanticReport.anchorChecks.some((item) => item.status === "missing") ||
            initial.semanticReport.issues.some(
              (issue) =>
                issue.code === "PROPOSITION_NOT_PRESERVED" ||
                issue.code === "PROPOSITION_UNCERTAIN" ||
                issue.code === "LOW_CONFIDENCE_ASSESSMENT" ||
                issue.code === "LOGICAL_RELATION_NOT_PRESERVED",
            );

          const semanticRestorationStartedAt = this.now();
          if (!initial.semanticReport.passed && hasRestorableDefects) {
            mark(
              "semantic-repair",
              "Одна ограниченная попытка восстановить пропущенные смысловые элементы с последующей независимой проверкой.",
              candidate.candidateId,
            );
            const prompt = buildSemanticRestorationPrompt({
              sourceText: request.sourceText,
              candidateText: currentText,
              inventory: request.inventory,
              propositionAssessments: currentAssessments,
              relationAssessments: currentRelationAssessments,
              semanticReport: currentEvaluation.semanticReport,
              donorBaseline: request.donorBaseline,
            });
            for (let restorationAttempt = 1; restorationAttempt <= 1; restorationAttempt++) {
              const rAt = this.now();
              try {
                const restoredText = (
                  await runWithTimeoutRetry(
                    () =>
                      this.deps.candidateGenerator.generate({
                        prompt,
                        candidateIndex: candidate.candidateIndex,
                        signal: request.signal,
                      }),
                    request.signal,
                  )
                ).trim();
                stagePrompts.push({
                  stage: "semantic-restoration",
                  candidateId: candidate.candidateId,
                  prompt,
                  createdAt: rAt,
                  durationMs: Math.max(0, this.now() - rAt),
                });

                if (!restoredText || restoredText === currentText) {
                  restorationWarnings.push(
                    "Восстановление содержания не изменило текст; исходный кандидат оставлен без изменений.",
                  );
                } else {
                  const preRestorationOverlap = computeWordTrigramOverlap(request.sourceText, currentText);
                  const restoredOverlap = computeWordTrigramOverlap(request.sourceText, restoredText);
                  const isSourceRegression =
                    request.unfilteredMode !== true &&
                    restoredOverlap >= 0.68 &&
                    restoredOverlap > preRestorationOverlap + 0.05;
                  if (isSourceRegression) {
                    restorationWarnings.push("Восстановление содержания откатилось к синтаксису исходника; откат отклонён.");
                    break;
                  }

                  let restoredAssessments: PropositionAssessment[];
                  let restoredRelations: LogicalRelationAssessment[];
                  if (this.deps.semanticVerifier.assessCombined) {
                    const restored = await runWithTimeoutRetry(
                      () =>
                        this.deps.semanticVerifier.assessCombined!({
                          sourceText: request.sourceText,
                          candidateText: restoredText,
                          propositions: request.inventory.propositions,
                          signal: request.signal,
                        }),
                      request.signal,
                    );
                    restoredAssessments = restored.propositionAssessments;
                    restoredRelations = restored.relationAssessments;
                  } else {
                    const [propositionResult, relationResult] = await Promise.all([
                      runWithTimeoutRetry(
                        () =>
                          this.deps.semanticVerifier.assess({
                            sourceText: request.sourceText,
                            candidateText: restoredText,
                            propositions: request.inventory.propositions,
                            signal: request.signal,
                          }),
                        request.signal,
                      ),
                      runWithTimeoutRetry(
                        () =>
                          this.deps.semanticVerifier.assessRelations({
                            sourceText: request.sourceText,
                            candidateText: restoredText,
                            propositions: request.inventory.propositions,
                            signal: request.signal,
                          }),
                        request.signal,
                      ),
                    ]);
                    restoredAssessments = propositionResult;
                    restoredRelations = relationResult;
                  }

                  const restoredStructure = validateLogicalRelationAssessments(
                    restoredText,
                    request.inventory.propositions,
                    restoredRelations,
                    request.semanticPolicy?.minimumAssessmentConfidence ??
                      DEFAULT_SEMANTIC_POLICY.minimumAssessmentConfidence,
                  );
                  const restoredProfile = this.deps.styleProfiler.analyze(restoredText);
                  const restoredEvaluation = evaluateCandidate(
                    {
                      candidateId: candidate.candidateId,
                      sourceText: request.sourceText,
                      outputText: restoredText,
                      inventory: request.inventory,
                      propositionAssessments: restoredAssessments,
                      donorBaseline: request.donorBaseline,
                      candidateProfile: restoredProfile,
                    },
                    {
                      minimumStyleScore,
                      minimumStyleConfidence: request.minimumStyleConfidence,
                      semanticPolicy: request.semanticPolicy,
                    },
                  );

                  if (!restoredStructure.passed) {
                    restoredEvaluation.semanticReport.passed = false;
                    restoredEvaluation.semanticReport.issues.push({
                      code: "LOGICAL_RELATION_NOT_PRESERVED",
                      severity: "error",
                      message: restoredStructure.issues.join(" "),
                    });
                    restoredEvaluation.disposition = "rejected";
                    restoredEvaluation.admissible = false;
                    restoredEvaluation.rejectionReasons.push(
                      "После восстановления содержания логическая структура всё ещё не подтверждена.",
                    );
                  }

                  if (restoredEvaluation.semanticReport.passed) {
                    const beforeRestScore = currentEvaluation.styleReport.score;
                    const afterRestScore = restoredEvaluation.styleReport.score;
                    stageDeltas.push({
                      stage: "semantic-restoration",
                      beforeScore: beforeRestScore,
                      afterScore: afterRestScore,
                      deltaScore:
                        beforeRestScore !== null && afterRestScore !== null
                          ? Number((afterRestScore - beforeRestScore).toFixed(1))
                          : null,
                      repaired: true,
                      repairPassed: true,
                      noGainReason: "none",
                    });
                    currentText = restoredText;
                    currentAssessments = restoredAssessments;
                    currentRelationAssessments = restoredRelations;
                    currentProfile = restoredProfile;
                    currentEvaluation = restoredEvaluation;
                    semanticRestorationApplied = true;
                  } else {
                    restorationWarnings.push(
                      "Попытка восстановления не прошла повторную проверку смысла; исходный кандидат не принят.",
                    );
                  }
                }
                break;
              } catch (error) {
                const errMsg = error instanceof Error ? error.message : "неизвестная ошибка";
                const isTransientRestorationError =
                  !request.signal?.aborted &&
                  restorationAttempt < 2 &&
                  /500|502|503|504|UNAVAILABLE|OVERLOADED|TIMEOUT|TIMED OUT|ECONNRESET|NETWORK|HIGH DEMAND/i.test(
                    errMsg,
                  );
                if (isTransientRestorationError) {
                  await new Promise<void>((resolve) => {
                    const timer = setTimeout(resolve, 2_500);
                    request.signal?.addEventListener(
                      "abort",
                      () => {
                        clearTimeout(timer);
                        resolve();
                      },
                      { once: true },
                    );
                  });
                  if (!request.signal?.aborted) continue;
                }
                restorationWarnings.push(`Не удалось восстановить содержание кандидата: ${errMsg}.`);
                break;
              }
            }
          }

          const semanticRestorationDurationMs = Math.max(0, this.now() - semanticRestorationStartedAt);
          diagnosticSteps.push({
            stage: "semantic-restoration",
            status: semanticRestorationApplied
              ? "completed"
              : initial.semanticReport.passed || !hasRestorableDefects
                ? "skipped"
                : "not-completed",
            detail: semanticRestorationApplied
              ? "Восстановление применено и повторно прошло проверку смысла."
              : initial.semanticReport.passed
                ? "Не запускалось: исходный кандидат уже сохранил смысл."
                : !hasRestorableDefects
                  ? "Не запускалось: не обнаружено конкретных дефектов для безопасного восстановления."
                  : restorationWarnings.join(" ") || "Попытка восстановления не привела к принятому тексту.",
            durationMs: semanticRestorationDurationMs,
          });

          const polishThreshold = request.criticPolishThreshold ?? 70;
          const preCriticScore = currentEvaluation.styleReport.score ?? 0;
          const wasAcceptedBeforeCritic = currentEvaluation.disposition === "accepted";
          const needsCriticPolish =
            polishThreshold !== undefined && wasAcceptedBeforeCritic && preCriticScore < polishThreshold;

          if (wasAcceptedBeforeCritic && !needsCriticPolish) {
            const diagnostics = buildAdvancedDiagnostics({
              sourceText: request.sourceText,
              finalText: currentText,
              candidateProfile: currentProfile,
              styleReport: currentEvaluation.styleReport,
              stageDeltas,
              latency: {
                candidateGenerationMs: generationDurationMs,
                semanticVerificationMs: semanticVerificationDurationMs,
                logicalStructureMs: logicalStructureDurationMs,
                styleProfilingMs: styleProfilingDurationMs,
                styleScoringMs: styleScoringDurationMs,
                semanticRestorationMs: semanticRestorationDurationMs,
              },
            });
            diagnosticSteps.push({
              stage: "style-critic-repair",
              status: "skipped",
              detail: "Не запускалось: кандидат уже прошёл порог принятия и стиля; дополнительная полировка не требовалась.",
            });
            outcomes.push({
              candidateId: candidate.candidateId,
              initial,
              finalText: currentText,
              finalEvaluation: currentEvaluation,
              repaired: semanticRestorationApplied,
              repairPassed: semanticRestorationApplied ? true : undefined,
              usedPrompt: candidatePrompt,
              diagnosticSteps: [
                ...diagnosticSteps,
                {
                  stage: "final-decision",
                  status: currentEvaluation.disposition === "accepted" ? "completed" : "failed",
                  detail: "Итоговый статус: " + currentEvaluation.disposition + ".",
                },
              ],
              diagnostics,
              warnings: [...new Set([...initial.warnings, ...restorationWarnings, ...currentEvaluation.warnings])],
            });
            if (adaptive && (currentEvaluation.styleReport.score ?? 0) >= styleTargetScore) {
              break candidateLoop;
            }
            continue;
          }

          if (!currentEvaluation.semanticReport.passed) {
            const diagnostics = buildAdvancedDiagnostics({
              sourceText: request.sourceText,
              finalText: candidate.text,
              candidateProfile: currentProfile,
              styleReport: initial.styleReport,
              stageDeltas,
              latency: {
                candidateGenerationMs: generationDurationMs,
                semanticVerificationMs: semanticVerificationDurationMs,
                logicalStructureMs: logicalStructureDurationMs,
                styleProfilingMs: styleProfilingDurationMs,
                styleScoringMs: styleScoringDurationMs,
                semanticRestorationMs: semanticRestorationDurationMs,
              },
            });
            diagnosticSteps.push({
              stage: "style-critic-repair",
              status: "skipped",
              detail:
                "Не запускалось намеренно: обязательная проверка смысла не пройдена, поэтому стилистическая правка заблокирована.",
            });
            outcomes.push({
              candidateId: candidate.candidateId,
              initial,
              finalText: candidate.text,
              finalEvaluation: initial,
              repaired: false,
              usedPrompt: candidatePrompt,
              diagnosticSteps: [
                ...diagnosticSteps,
                {
                  stage: "final-decision",
                  status: "failed",
                  detail: "Кандидат отклонён: обязательная проверка смысла не пройдена.",
                },
              ],
              diagnostics,
              warnings: [
                ...new Set([
                  ...initial.warnings,
                  ...restorationWarnings,
                  "Стилистическая правка пропущена: кандидат не прошёл обязательную проверку сохранности смысла.",
                ]),
              ],
            });
            continue;
          }

          const criticRepairStartedAt = this.now();
          mark(
            "critic-repair",
            "Одна ограниченная попытка точечной правки с независимой повторной проверкой.",
            candidate.candidateId,
          );
          try {
            const pipeline = await runCriticRepairPipeline(
              {
                candidateId: candidate.candidateId,
                sourceText: request.sourceText,
                candidateText: currentText,
                inventory: request.inventory,
                donorBaseline: request.donorBaseline,
                criticAdapter: this.deps.critic,
                repairAdapter: this.deps.repair,
                semanticVerifier: {
                  ...(this.deps.semanticVerifier.assessCombined
                    ? {
                        assessCombined: ({ sourceText, candidateText, propositions }) =>
                          runWithTimeoutRetry(
                            () =>
                              this.deps.semanticVerifier.assessCombined!({
                                sourceText,
                                candidateText,
                                propositions,
                                signal: request.signal,
                              }),
                            request.signal,
                          ),
                      }
                    : {}),
                  assess: ({ sourceText, candidateText, propositions }) =>
                    runWithTimeoutRetry(
                      () =>
                        this.deps.semanticVerifier.assess({
                          sourceText,
                          candidateText,
                          propositions,
                          signal: request.signal,
                        }),
                      request.signal,
                    ),
                  assessRelations: ({ sourceText, candidateText, propositions }) =>
                    runWithTimeoutRetry(
                      () =>
                        this.deps.semanticVerifier.assessRelations({
                          sourceText,
                          candidateText,
                          propositions,
                          signal: request.signal,
                        }),
                      request.signal,
                    ),
                },
                styleProfiler: this.deps.styleProfiler,
                semanticPolicy: request.semanticPolicy,
                signal: request.signal,
                initialVerification: {
                  propositionAssessments: currentAssessments,
                  relationAssessments: currentRelationAssessments,
                  styleProfile: currentProfile,
                },
              },
              {
                critic: request.critic,
                repair: request.repair,
                verification: {
                  ...request.verification,
                  minimumStyleScore,
                  minimumStyleConfidence: request.minimumStyleConfidence ?? request.verification?.minimumStyleConfidence,
                },
              },
            );

            const criticRepairDurationMs = Math.max(0, this.now() - criticRepairStartedAt);
            const finalEvaluation = pipeline.verification.after;
            diagnosticSteps.push({
              stage: "style-critic-repair",
              status: pipeline.verificationCompleted ? "completed" : "not-completed",
              detail:
                "Этап критика/правки вызван. Правка применена: " +
                (pipeline.repairResult.applied ? "да" : "нет") +
                "; повторная проверка выполнена: " +
                (pipeline.verificationCompleted ? "да" : "нет") +
                "; кандидат прошёл все проверки: " +
                (pipeline.completed ? "да" : "нет") +
                ". " +
                pipeline.warnings.join(" "),
              durationMs: criticRepairDurationMs,
            });

            const afterScore = finalEvaluation.styleReport.score ?? -1;
            const noGainReason: StageScoreDelta["noGainReason"] = !pipeline.repairResult.applied
              ? "not-applied"
              : !pipeline.verificationCompleted
                ? "reverification-incomplete"
                : !finalEvaluation.semanticReport.passed
                  ? "semantic-check-failed"
                  : finalEvaluation.disposition !== "accepted"
                    ? "below-acceptance-threshold"
                    : afterScore <= preCriticScore
                      ? "score-dropped-or-flat"
                      : "none";

            stageDeltas.push({
              stage: "style-critic-repair",
              beforeScore: preCriticScore,
              afterScore: finalEvaluation.styleReport.score,
              deltaScore: Number((afterScore - preCriticScore).toFixed(1)),
              repaired: pipeline.repairResult.applied,
              repairPassed: pipeline.completed,
              noGainReason,
            });

            const keepPreCriticAccepted =
              wasAcceptedBeforeCritic &&
              (!pipeline.completed || finalEvaluation.disposition !== "accepted" || afterScore < preCriticScore);

            if (keepPreCriticAccepted) {
              const repairedImprovesStyle =
                pipeline.repairResult.applied &&
                finalEvaluation.semanticReport.passed &&
                afterScore > preCriticScore;

              if (repairedImprovesStyle) {
                const upgradedEval: CandidateEvaluationResult = {
                  ...finalEvaluation,
                  disposition: "needs-review",
                  admissible: true,
                };
                const diagnostics = buildAdvancedDiagnostics({
                  sourceText: request.sourceText,
                  finalText: pipeline.finalText,
                  candidateProfile: this.deps.styleProfiler.analyze(pipeline.finalText),
                  styleReport: upgradedEval.styleReport,
                  stageDeltas,
                  latency: {
                    candidateGenerationMs: generationDurationMs,
                    semanticVerificationMs: semanticVerificationDurationMs,
                    logicalStructureMs: logicalStructureDurationMs,
                    styleProfilingMs: styleProfilingDurationMs,
                    styleScoringMs: styleScoringDurationMs,
                    semanticRestorationMs: semanticRestorationDurationMs,
                    criticRepairMs: criticRepairDurationMs,
                  },
                });
                outcomes.push({
                  candidateId: candidate.candidateId,
                  initial,
                  finalText: pipeline.finalText,
                  finalEvaluation: upgradedEval,
                  repaired: true,
                  repairPassed: false,
                  usedPrompt: candidatePrompt,
                  diagnosticSteps: [
                    ...diagnosticSteps,
                    {
                      stage: "final-decision",
                      status: "completed",
                      detail:
                        "Применён вариант после правки с более высоким стилевым баллом (" +
                        afterScore +
                        " против " +
                        preCriticScore +
                        ") в статусе needs-review.",
                    },
                  ],
                  diagnostics,
                  warnings: [
                    ...new Set([
                      ...initial.warnings,
                      ...restorationWarnings,
                      ...pipeline.warnings,
                      "Повторная проверка после правки не завершилась полностью, но стилевой балл вырос; вариант выдан для просмотра.",
                    ]),
                  ],
                });
              } else {
                const diagnostics = buildAdvancedDiagnostics({
                  sourceText: request.sourceText,
                  finalText: currentText,
                  candidateProfile: currentProfile,
                  styleReport: currentEvaluation.styleReport,
                  stageDeltas,
                  latency: {
                    candidateGenerationMs: generationDurationMs,
                    semanticVerificationMs: semanticVerificationDurationMs,
                    logicalStructureMs: logicalStructureDurationMs,
                    styleProfilingMs: styleProfilingDurationMs,
                    styleScoringMs: styleScoringDurationMs,
                    semanticRestorationMs: semanticRestorationDurationMs,
                    criticRepairMs: criticRepairDurationMs,
                  },
                });
                outcomes.push({
                  candidateId: candidate.candidateId,
                  initial,
                  finalText: currentText,
                  finalEvaluation: currentEvaluation,
                  repaired: semanticRestorationApplied,
                  repairPassed: semanticRestorationApplied ? true : undefined,
                  usedPrompt: candidatePrompt,
                  diagnosticSteps: [
                    ...diagnosticSteps,
                    {
                      stage: "final-decision",
                      status: "completed",
                      detail: "Сохранён ранее принятый семантически проверенный вариант.",
                    },
                  ],
                  diagnostics,
                  warnings: [
                    ...new Set([
                      ...initial.warnings,
                      ...restorationWarnings,
                      ...pipeline.warnings,
                      "Точечная доработка критика не улучшила уже принятый вариант; сохранён проверенный кандидат.",
                    ]),
                  ],
                });
              }

              if (adaptive && Math.max(preCriticScore, afterScore) >= styleTargetScore) {
                break candidateLoop;
              }
            } else {
              const diagnostics = buildAdvancedDiagnostics({
                sourceText: request.sourceText,
                finalText: pipeline.finalText,
                candidateProfile: this.deps.styleProfiler.analyze(pipeline.finalText),
                styleReport: finalEvaluation.styleReport,
                stageDeltas,
                latency: {
                  candidateGenerationMs: generationDurationMs,
                  semanticVerificationMs: semanticVerificationDurationMs,
                  logicalStructureMs: logicalStructureDurationMs,
                  styleProfilingMs: styleProfilingDurationMs,
                  styleScoringMs: styleScoringDurationMs,
                  semanticRestorationMs: semanticRestorationDurationMs,
                  criticRepairMs: criticRepairDurationMs,
                },
              });
              outcomes.push({
                candidateId: candidate.candidateId,
                initial,
                finalText: pipeline.finalText,
                finalEvaluation,
                repaired: semanticRestorationApplied || pipeline.repairResult.applied,
                repairPassed: pipeline.completed,
                usedPrompt: candidatePrompt,
                diagnosticSteps: [
                  ...diagnosticSteps,
                  {
                    stage: "final-decision",
                    status: finalEvaluation.disposition === "accepted" ? "completed" : "failed",
                    detail: "Итоговый статус после критика и повторной проверки: " + finalEvaluation.disposition + ".",
                  },
                ],
                diagnostics,
                warnings: [...new Set([...initial.warnings, ...restorationWarnings, ...pipeline.warnings])],
              });
              if (adaptive && pipeline.completed && finalEvaluation.disposition === "accepted" && afterScore >= styleTargetScore) {
                break candidateLoop;
              }
            }
          } catch (error) {
            const criticRepairDurationMs = Math.max(0, this.now() - criticRepairStartedAt);
            const diagnostics = buildAdvancedDiagnostics({
              sourceText: request.sourceText,
              finalText: currentText,
              candidateProfile: currentProfile,
              styleReport: currentEvaluation.styleReport,
              stageDeltas,
              latency: {
                candidateGenerationMs: generationDurationMs,
                semanticVerificationMs: semanticVerificationDurationMs,
                logicalStructureMs: logicalStructureDurationMs,
                styleProfilingMs: styleProfilingDurationMs,
                styleScoringMs: styleScoringDurationMs,
                semanticRestorationMs: semanticRestorationDurationMs,
                criticRepairMs: criticRepairDurationMs,
              },
            });
            diagnosticSteps.push({
              stage: "style-critic-repair",
              status: "failed",
              detail: error instanceof Error ? error.message : "Неизвестная ошибка критика/правки.",
              durationMs: criticRepairDurationMs,
            });

            // A failed optional polish may preserve a previously accepted candidate,
            // but only when its semantic and 76-point production gates already passed.
            const safeAcceptedFallback =
              wasAcceptedBeforeCritic &&
              currentEvaluation.disposition === "accepted" &&
              currentEvaluation.semanticReport.passed &&
              currentEvaluation.styleReport.status === "scored" &&
              currentEvaluation.styleReport.score !== null &&
              currentEvaluation.styleReport.score >= minimumStyleScore;
            const fallbackEvaluation: CandidateEvaluationResult =
              currentEvaluation.disposition === "accepted" && !safeAcceptedFallback
                ? {
                    ...currentEvaluation,
                    disposition: "needs-review",
                    admissible: false,
                    rejectionReasons: [
                      ...currentEvaluation.rejectionReasons,
                      "Кандидат не может быть принят: обязательный этап критики/проверки завершился ошибкой.",
                    ],
                  }
                : currentEvaluation;

            outcomes.push({
              candidateId: candidate.candidateId,
              initial,
              finalText: currentText,
              finalEvaluation: fallbackEvaluation,
              repaired: semanticRestorationApplied,
              repairPassed: safeAcceptedFallback && semanticRestorationApplied ? true : false,
              usedPrompt: candidatePrompt,
              diagnosticSteps: [
                ...diagnosticSteps,
                {
                  stage: "final-decision",
                  status: safeAcceptedFallback ? "completed" : "failed",
                  detail: safeAcceptedFallback
                    ? "Необязательная стилистическая доводка завершилась ошибкой; сохранён ранее проверенный кандидат, прошедший все обязательные проверки и порог 76/100."
                    : "Этап критики/правки завершился исключением; кандидат не принят, сохранён только как результат для диагностики.",
                },
              ],
              diagnostics,
              warnings: [
                ...restorationWarnings,
                error instanceof Error ? error.message : "Critic/repair stage failed.",
                ...(safeAcceptedFallback
                  ? ["Сбой необязательной полировки не отменил ранее подтверждённый результат."]
                  : ["Результат не принят из-за сбоя обязательного этапа проверки/правки."]),
              ],
            });
            if (adaptive && wasAcceptedBeforeCritic && preCriticScore >= styleTargetScore) {
              break candidateLoop;
            }
          }
        }

        if (
          batchPos === candidateBatches.length - 1 &&
          generation.generated === 0 &&
          request.enableCompactRecovery === true &&
          !compactRecoveryAttempted &&
          !request.signal?.aborted &&
          generation.candidates.some(
            (c) => c.status === "failed" && !/API_KEY_INVALID|UNAUTHENTICATED|safety|PROHIBITED/i.test(c.error ?? ""),
          )
        ) {
          compactRecoveryAttempted = true;
          candidateBatches.push({
            candidateStartIndex: generation.candidates.length,
            compactRecovery: true,
          });
        }
      }

      generation.warnings = [...new Set(generation.warnings)];

      if (request.signal?.aborted) {
        mark("cancelled", "Запрос отменён; уже полученные результаты сохранены.");
        return {
          requestId: request.requestId,
          status: "cancelled",
          totalDurationMs: Math.max(0, this.now() - startedAt),
          stagePrompts,
          sourceFingerprint,
          donorBaselineId: baselineId,
          generation,
          candidates: outcomes,
          trace,
          warnings: [...new Set(warnings)],
        };
      }

      const accepted = outcomes
        .filter((item) =>
          item.finalEvaluation.disposition === "accepted" &&
          (!item.repaired || item.repairPassed === true) &&
          !item.diagnosticSteps.some((step) => step.stage === "final-decision" && step.status !== "completed"),
        )
        .sort((a, b) => (b.finalEvaluation.styleReport.score ?? -1) - (a.finalEvaluation.styleReport.score ?? -1));
      const review = outcomes
        .filter((item) => item.finalEvaluation.disposition === "needs-review")
        .sort((a, b) => (b.finalEvaluation.styleReport.score ?? -1) - (a.finalEvaluation.styleReport.score ?? -1));
      const rankedOutcomes = [...outcomes].sort((a, b) => {
        const semDiff = Number(b.finalEvaluation.semanticReport.passed) - Number(a.finalEvaluation.semanticReport.passed);
        if (semDiff !== 0) return semDiff;
        const scoreDiff = (b.finalEvaluation.styleReport.score ?? -1) - (a.finalEvaluation.styleReport.score ?? -1);
        if (scoreDiff !== 0) return scoreDiff;
        const propDiff =
          (b.finalEvaluation.semanticReport.mandatoryPropositionsPreserved ?? 0) -
          (a.finalEvaluation.semanticReport.mandatoryPropositionsPreserved ?? 0);
        return propDiff;
      });
      const fallbackOutcome = rankedOutcomes.find(
        (item) => typeof item.finalText === "string" && item.finalText.trim().length > 0,
      );
      const fallbackRawGenerated = generation.candidates.find(
        (item) => item.status === "generated" && typeof item.text === "string" && item.text.trim().length > 0,
      );

      const selected = accepted[0];
      const bestAvailableText =
        selected?.finalText ?? review[0]?.finalText ?? fallbackOutcome?.finalText ?? fallbackRawGenerated?.text;
      const bestAvailableCandidateId =
        selected?.candidateId ??
        review[0]?.candidateId ??
        fallbackOutcome?.candidateId ??
        fallbackRawGenerated?.candidateId;
      const status = selected ? "accepted" : review.length ? "needs-review" : "rejected";

      mark(
        "completed",
        selected
          ? "Выбран кандидат, прошедший обязательные проверки и показавший наилучший стиль."
          : bestAvailableText
            ? "Кандидат сформирован и выдан в неблокирующем режиме (подробности и спорные места отражены в диагностике)."
            : "Нет сгенерированного текста кандидата.",
      );

      for (const item of outcomes) warnings.push(...item.warnings);
      const modelDiagnostics = this.deps.getSignalDiagnostics?.(request.signal);
      if (modelDiagnostics?.warnings?.length) {
        warnings.push(...modelDiagnostics.warnings);
      }

      const totalDurationMs = Math.max(0, this.now() - startedAt);
      const chosenOutcome = selected ?? review[0] ?? fallbackOutcome;
      const chosenScore = chosenOutcome?.finalEvaluation.styleReport.score ?? null;
      const chosenPrompt = chosenOutcome?.usedPrompt ?? stagePrompts[0]?.prompt;
      const selectionDiagnostics: SelectionDiagnostics = {
        decision: status,
        ...(selected ? { selectedCandidateId: selected.candidateId } : {}),
        ...(bestAvailableCandidateId ? { bestAvailableCandidateId } : {}),
        bestAvailableIsGeneratedCandidate: Boolean(bestAvailableText && bestAvailableCandidateId),
        candidates: outcomes.map((outcome) => ({
          candidateId: outcome.candidateId,
          initialDisposition: outcome.initial.disposition,
          finalDisposition: outcome.finalEvaluation.disposition,
          initialRejectionReasons: [...outcome.initial.rejectionReasons],
          finalRejectionReasons: [...outcome.finalEvaluation.rejectionReasons],
          styleScore: outcome.finalEvaluation.styleReport.score,
          styleConfidence: outcome.finalEvaluation.styleReport.confidence,
          semanticPassed: outcome.finalEvaluation.semanticReport.passed,
          sourceTrigramOverlap: computeWordTrigramOverlap(request.sourceText, outcome.finalText),
          sourceLengthRatio: request.sourceText.length > 0 ? outcome.finalText.length / request.sourceText.length : 0,
          selected: outcome.candidateId === selected?.candidateId,
          bestAvailable: outcome.candidateId === bestAvailableCandidateId,
        })),
        explanation: selected
          ? `Выбран ${selected.candidateId}: кандидат прошёл обязательные проверки и допущен к выдаче.`
          : review.length
            ? `Статус needs-review: ни один кандидат не получил автоматическое принятие; ${review.length} кандидат(а) сохранены для ручной проверки.`
            : bestAvailableText
              ? `Статус rejected при наличии bestAvailableText: текст ${bestAvailableCandidateId ?? "без ID"} сохранён как диагностический/резервный результат, но не прошёл критерии автоматического принятия. Это не означает, что он был выбран как accepted.`
              : "Статус rejected: ни один кандидат не прошёл критерии, пригодного сгенерированного текста для выдачи нет.",
      };

      // The 40-point report is informational: a diagnostics failure must never
      // turn a valid generated result into a failed transfer.
      let dnaDiagnostics40: StyleTransferResponse["dnaDiagnostics40"];
      const donorText = request.donorBaseline.donorText;
      if (bestAvailableText && typeof donorText === "string") {
        try {
          dnaDiagnostics40 = buildDnaDiagnostics40({
            donorText,
            sourceText: request.sourceText,
            resultText: bestAvailableText,
            styleIntensity: request.generation?.styleIntensity,
            elapsedMs: totalDurationMs,
            v2Response: {
              status,
              requestedModel: modelDiagnostics?.requestedModel,
              usedModel: modelDiagnostics?.usedModel,
              fallbackOccurred: modelDiagnostics?.fallbackOccurred,
              selectedCandidateId: selected?.candidateId,
              bestAvailableCandidateId,
              totalDurationMs,
              warnings: [...new Set(warnings)],
              candidates: outcomes,
            },
          });
        } catch (diagnosticError) {
          const detail = diagnosticError instanceof Error ? diagnosticError.message : "Неизвестная ошибка.";
          warnings.push("Не удалось рассчитать 40-параметрическую диагностику Style DNA: " + detail);
        }
      } else if (bestAvailableText) {
        warnings.push("40-параметрическая диагностика Style DNA недоступна: донорский текст не сохранён в baseline.");
      }

      const historyEntry: PromptResultHistoryEntry | undefined = bestAvailableText
        ? {
            id: `hist-${request.requestId}-${this.now()}`,
            requestId: request.requestId,
            createdAt: this.now(),
            totalDurationMs,
            status,
            usedModel: modelDiagnostics?.usedModel,
            requestedModel: modelDiagnostics?.requestedModel,
            styleScore: chosenScore,
            sourceText: request.sourceText,
            donorFingerprint: request.donorBaseline.profile.sourceFingerprint,
            resultText: bestAvailableText,
            prompts: stagePrompts,
          }
        : undefined;

      return {
        requestId: request.requestId,
        status,
        selectedText: selected?.finalText,
        selectedCandidateId: selected?.candidateId,
        ...(bestAvailableText ? { bestAvailableText, bestAvailableCandidateId } : {}),
        ...(modelDiagnostics?.requestedModel ? { requestedModel: modelDiagnostics.requestedModel } : {}),
        ...(modelDiagnostics?.usedModel ? { usedModel: modelDiagnostics.usedModel } : {}),
        ...(typeof modelDiagnostics?.fallbackOccurred === "boolean"
          ? { fallbackOccurred: modelDiagnostics.fallbackOccurred }
          : {}),
        totalDurationMs,
        ...(chosenPrompt ? { usedPrompt: chosenPrompt } : {}),
        stagePrompts,
        ...(modelDiagnostics?.modelCalls ? { modelCalls: modelDiagnostics.modelCalls } : {}),
        selectionDiagnostics,
        ...(historyEntry ? { historyEntry } : {}),
        sourceFingerprint,
        donorBaselineId: baselineId,
        generation,
        candidates: outcomes,
        ...(dnaDiagnostics40 ? { dnaDiagnostics40 } : {}),
        trace,
        warnings: [...new Set(warnings)],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown application error.";
      const cancelled = request.signal?.aborted === true;
      mark(cancelled ? "cancelled" : "failed", message);
      return {
        requestId: request.requestId,
        status: cancelled ? "cancelled" : "rejected",
        totalDurationMs: Math.max(0, this.now() - startedAt),
        stagePrompts,
        sourceFingerprint,
        donorBaselineId: baselineId,
        generation: emptyGeneration,
        candidates: [],
        trace,
        warnings,
        error: { code: cancelled ? "CANCELLED" : "STYLE_TRANSFER_FAILED", message },
      };
    }
  }
}
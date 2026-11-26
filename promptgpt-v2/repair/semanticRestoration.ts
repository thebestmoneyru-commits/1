import type { FactInventory, PropositionAssessment, SemanticReport } from "../types";
import type { LogicalRelationAssessment } from "../semantic/logicalRelationPreservation";
import type { DonorStyleBaseline } from "../style/styleTypes";
import { countWords } from "../style/tokenizer";

/**
 * Builds a single bounded restoration pass when independent verification finds
 * concrete semantic omissions. The current candidate is the style carrier;
 * the immutable source remains the only authority for meaning.
 */
export function buildSemanticRestorationPrompt(input: {
  sourceText: string;
  candidateText: string;
  inventory: FactInventory;
  propositionAssessments: readonly PropositionAssessment[];
  relationAssessments: readonly LogicalRelationAssessment[];
  semanticReport: SemanticReport;
  donorBaseline?: DonorStyleBaseline;
}): string {
  const failedPropositions = input.propositionAssessments
    .filter((item) => item.status !== "preserved")
    .map((item) => ({
      propositionId: item.propositionId,
      status: item.status,
      outputEvidence: item.outputEvidence,
      verifierFinding: item.rationale,
      sourceProposition: input.inventory.propositions.find((p) => p.id === item.propositionId),
    }));
  const failedRelations = input.relationAssessments
    .filter((item) => item.status !== "preserved")
    .map((item) => ({
      relationKey: item.relationKey,
      status: item.status,
      outputEvidence: item.outputEvidence,
      verifierFinding: item.rationale,
    }));
  const missingAnchors = input.semanticReport.anchorChecks
    .filter((item) => item.status === "missing")
    .map((item) => {
      const anchor = input.inventory.anchors.find((candidate) => candidate.id === item.anchorId);
      return anchor ? {
        kind: anchor.kind,
        value: anchor.value,
        requiredOccurrences: anchor.requiredOccurrences,
      } : { anchorId: item.anchorId };
    });
  const sourceWords = countWords(input.sourceText);
  const candidateWords = countWords(input.candidateText);
  const donorCorpus = input.donorBaseline?.profile.corpus;
  const donorStyleNote = donorCorpus
    ? `Ориентиры ДНК донора: средняя длина ~${donorCorpus.meanWordsPerSentence.toFixed(1)} сл., коротких (<=8 сл.) ${(donorCorpus.sentenceLengthDistribution.short.share * 100).toFixed(0)}%, длинных (>20 сл.) ${((donorCorpus.sentenceLengthDistribution.long.share + donorCorpus.sentenceLengthDistribution.veryLong.share) * 100).toFixed(0)}%, предложений в абзаце ~${donorCorpus.meanSentencesPerParagraph.toFixed(1)}.`
    : undefined;
  // Prefer verified, feature-linked donor excerpts over an arbitrary prefix of the donor text.
  // This gives restoration a small, representative style sample without adding another model call.
  const donorEvidence = input.donorBaseline?.profile.features
    .filter((feature) => feature.observations > 0 && feature.confidence >= 0.45 && feature.evidence.length > 0)
    .sort(
      (a, b) =>
        b.confidence * Math.min(b.observations, 8) -
        a.confidence * Math.min(a.observations, 8),
    )
    .slice(0, 6)
    .map((feature) => ({
      feature: feature.label,
      excerpt: feature.evidence[0].excerpt,
    }));
  const donorExcerpt = donorEvidence?.length
    ? donorEvidence
    : input.donorBaseline?.donorText
      ? input.donorBaseline.donorText.slice(0, 600)
      : undefined;

  return [
    "ЗАДАЧА: восстанови в преобразованном тексте все утраченные элементы исходного содержания.",
    "Это ТОЧЕЧНОЕ смысловое дополнение/уточнение ТЕКУЩЕГО КАНДИДАТА, а не возврат к тексту исходника! Сохраняй структуру, ритм, разбивку на короткие/длинные фразы, тире, скобки и авторские зачины CURRENT CANDIDATE JSON — меняй или дополняй ТОЛЬКО те места, на которые указывают failedPropositions, failedRelations и missingAnchors.",
    "ЗАПРЕТ ДОСЛОВНОГО КОПИРОВАНИЯ ИСХОДНИКА: КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО вставлять целые предложения или абзацы дословно из IMMUTABLE ORIGINAL SOURCE JSON! Если восстановление возвращает казённый синтаксис исходника — правка испорчена. Встраивай недостающий смысл исключительно почерком и синтаксисом кандидата/донора.",
    "Сохрани удачные синтаксические и ритмические решения кандидата и его ДНК донора, меняя только то, что необходимо для восстановления полного смысла. Не исправляй уже перенесённые из донора орфографические отклонения, опечатки, грамматические несогласования и разрежённую или нестандартную пунктуацию (например, отсутствие запятых) к нейтральной литературной норме — удерживай манеру кандидата без смущения и нормализации. В то же время исправь случайные бессмысленные подмены слов или порчу ключевых терминов (если таковые попали в черновик), вернув точный смысл исходника.",
    "Обязательно восстанови каждое пропущенное или изменённое положение, включая определения, наречия степени и частотности, усилители, ограничения, условия, временные уточнения, оговорки, сравнения, причинные пояснения и смысловые оттенки.",
    "ЗАПРЕТ ИНВЕРСИИ ЛОГИЧЕСКИХ СВЯЗЕЙ: если в failedRelations указана перевёрнутая или ослабленная связь (для cause: from — причина, to — следствие; для effect: from — следствие, to — причина), строго восстанови исходное направление отношения между теми же положениями в синтаксисе донора! Не подменяй причину следствием.",
    "НЕ ТРЕБУЙ ДОСЛОВНОГО ПОВТОРА СОЮЗА: проверяй сохранение типа, направления и силы отношения между теми же пропозициями. Семантически равнозначная конструкция в манере донора допустима, только если связь остаётся однозначной; вводное слово или простое соседство предложений не заменяет причинную, целевую, уступительную или временную связь.",
    "Не считай сохранение общего тезиса достаточным, если из него исчезло хотя бы одно существенное уточнение. Не заменяй конкретное положение более общим выражением.",
    "Сохрани все исходные числа, даты, имена, термины, цитаты, отрицания, модальность, атрибуцию и логические отношения. Не добавляй сведений, которых нет в оригинале.",
    "Сверь каждую пропозицию и каждую связь из SOURCE INVENTORY с итоговым текстом. Семантически равнозначная формулировка в стиле донора допустима, но все исходные смысловые компоненты должны присутствовать.",
    "Не копируй факты, лексику или предметное содержание из донорских текстов. Не добавляй объяснений от себя.",
    ...(donorStyleNote ? [donorStyleNote] : []),
    ...(donorExcerpt ? ["ОБРАЗЕЦ СИНТАКСИСА ДОНОРА (удерживай именно такой ритм и форму, НЕ копируй факты):", JSON.stringify(donorExcerpt)] : []),
    "Ориентир по объёму — не менее 90% числа слов исходника, если только точное сохранение содержания не требует иного. Текущий кандидат короче исходника — проверь, не вызвано ли это пропусками.",
    "КРИТИЧЕСКОЕ ПРАВИЛО БАЗОВОГО ТЕКСТА: твоя основа — CURRENT CANDIDATE JSON! Начни редактирование именно с CURRENT CANDIDATE JSON и точечно дополни ТОЛЬКО те места, где потеряны пункты из VERIFICATION FINDINGS JSON. Все уже сохранённые предложения CURRENT CANDIDATE JSON ЗАПРЕЩЕНО откатывать обратно к формулировкам из IMMUTABLE ORIGINAL SOURCE JSON!",
    "Верни только полный исправленный текст, сохранив абзацы. Не возвращай JSON, отчёт, комментарии или список изменений.",
    "",
    "CURRENT CANDIDATE JSON:",
    JSON.stringify(input.candidateText),
    "",
    "VERIFICATION FINDINGS JSON:",
    JSON.stringify({
      failedPropositions,
      failedRelations,
      missingAnchors,
      semanticIssues: input.semanticReport.issues,
    }, null, 2),
    "",
    "SOURCE INVENTORY JSON:",
    JSON.stringify({
      anchors: input.inventory.anchors,
      propositions: input.inventory.propositions,
    }, null, 2),
    "",
    "SOURCE WORD COUNT:",
    String(sourceWords),
    "",
    "CURRENT CANDIDATE WORD COUNT:",
    String(candidateWords),
    "",
    "IMMUTABLE ORIGINAL SOURCE JSON:",
    JSON.stringify(input.sourceText),
  ].join("\n");
}

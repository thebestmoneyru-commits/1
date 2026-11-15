import { createStyleTransferRequestPreparer } from "./requestPreparation";
import type { ModelRouter } from "../infrastructure/modelRouter";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const source = "Святитель пришёл в город. Он помог людям.";
const validExtraction = [
  { id: "p1", summary: "Святитель пришёл в город", sourceSpan: { start: 0, end: 25, text: source.slice(0, 25) }, subject: "Святитель", predicate: "пришёл", object: "в город", polarity: "positive", qualifications: [], relations: [], mandatory: true },
  { id: "p2", summary: "Он помог людям", sourceSpan: { start: 26, end: source.length, text: source.slice(26) }, subject: "Он", predicate: "помог", object: "людям", polarity: "positive", qualifications: [], relations: [], mandatory: true },
];

function fakeRouter(...outputs: unknown[]): ModelRouter {
  let call = 0;
  return {
    async generate() {
      const output = outputs[Math.min(call, outputs.length - 1)];
      call += 1;
      return { text: JSON.stringify(output), requestedModel: "test", usedModel: "test", fallbackOccurred: false, attempts: [], warnings: [] };
    },
  } as unknown as ModelRouter;
}
const interpretationAudit = (ids: string[], issues: unknown[] = []) => ({ checkedPropositionIds: ids, issues });
const structureAudit = (ids: string[], issues: unknown[] = []) => ({ checkedPropositionIds: ids, checkedRelationKeys: [], issues });
const donor = Array.from({ length: 40 }, (_, i) =>
  `В тот день святой отец пришёл в храм, где собралось множество людей. Он говорил с ними долго и внимательно, наставляя каждого на путь добра.`
).join("\n\n");

export async function runRequestPreparationSelfTests(): Promise<{ passed: number; names: string[] }> {
  const names: string[] = [];
  const routes = { semanticExtraction: { preferredModel: "extractor" } };
  const prepare = createStyleTransferRequestPreparer(fakeRouter(validExtraction, { missingPropositions: [], missingRelations: [] }, interpretationAudit(["p1", "p2"]), structureAudit(["p1", "p2"])), routes, {
    analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 },
  });
  const result = await prepare({ requestId: "test", sourceText: source, donorText: donor });
  assert(result.inventory.propositions.length === 2, "validated propositions must enter the source-bound inventory");
  assert(result.inventory.sourceLength === source.length, "inventory must bind to exact source length");
  assert(result.donorBaseline.profile.status === "sufficient", "sufficient donor sample must produce a frozen baseline");
  names.push("build source-bound inventory and donor baseline");

  const selfRelationSource = "Дождь пошёл, поэтому путники укрылись.";
  const selfRelationExtraction = [
    { id: "p1", summary: "Дождь пошёл", sourceSpan: { start: 0, end: "Дождь пошёл".length, text: "Дождь пошёл" }, subject: "Дождь", predicate: "пошёл", polarity: "positive", qualifications: [], relations: [{ kind: "cause", from: "p1", to: "p1", expression: "поэтому" }], mandatory: true },
    { id: "p2", summary: "Путники укрылись", sourceSpan: { start: selfRelationSource.indexOf("путники"), end: selfRelationSource.length, text: "путники укрылись." }, subject: "путники", predicate: "укрылись", polarity: "positive", qualifications: [], relations: [], mandatory: true },
  ];
  const repairedRelations = [
    { id: "p1", relations: [{ kind: "cause", from: "p1", to: "p2", expression: "поэтому" }] },
    { id: "p2", relations: [] },
  ];
  const selfRelationRepaired = await createStyleTransferRequestPreparer(
    fakeRouter(
      selfRelationExtraction,
      repairedRelations,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1", "p2"]),
      { checkedPropositionIds: ["p1", "p2"], checkedRelationKeys: [JSON.stringify(["cause", "p1", "p2", "поэтому"])], issues: [] },
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "repair-self-relation", sourceText: selfRelationSource, donorText: donor });
  assert(
    selfRelationRepaired.inventory.propositions.find((item) => item.id === "p1")?.relations.some(
      (relation) => relation.from === "p1" && relation.to === "p2" && relation.expression === "поэтому",
    ),
    "a self-referential edge must be repairable without changing proposition content",
  );
  names.push("repair isolated self-referential relations while preserving proposition fields");

  let invalidSelfRelationRepairRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        selfRelationExtraction,
        [
          { id: "p1", relations: [{ kind: "cause", from: "p1", to: "p1", expression: "поэтому" }] },
          { id: "p2", relations: [] },
        ],
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "reject-unfixed-self-relation", sourceText: selfRelationSource, donorText: donor });
  } catch (error) {
    invalidSelfRelationRepairRejected = String(error).includes("логическое отношение не может ссылаться на саму себя");
  }
  assert(invalidSelfRelationRepairRejected, "an invalid relation repair must still fail strict validation");
  names.push("reject a self-referential relation that survives the bounded repair pass");

  const omitted = {
    id: "p3", summary: "Он основал обитель", sourceSpan: { start: 0, end: 25, text: source.slice(0, 25) },
    subject: "Он", predicate: "основал", object: "обитель", polarity: "positive",
    qualifications: [], relations: [], mandatory: true,
  };
  const audited = await createStyleTransferRequestPreparer(
    fakeRouter(validExtraction, { missingPropositions: [omitted], missingRelations: [] }, interpretationAudit(["p1", "p2", "p3"]), structureAudit(["p1", "p2", "p3"])), routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "audit", sourceText: source, donorText: donor });
  assert(audited.inventory.propositions.length === 3, "omission audit must add validated missing propositions");
  assert(audited.inventory.propositions.some((item) => item.id === "p3"), "audited omission must be retained");
  names.push("recover source-grounded omissions found by independent audit");

  let malformedAuditRejected = false;
  try {
    await createStyleTransferRequestPreparer(fakeRouter(validExtraction, []), routes, {
      analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 },
    })({ requestId: "bad-audit", sourceText: source, donorText: donor });
  } catch (error) { malformedAuditRejected = String(error).includes("invalid missingPropositions"); }
  assert(malformedAuditRejected, "malformed completeness audit must fail closed");
  names.push("reject malformed completeness audit responses");

  const invalidAuditSpan = {
    id: "p4", summary: "Недостоверное утверждение", sourceSpan: { start: 0, end: 25, text: "not the source" },
    subject: "Он", predicate: "сделал", polarity: "positive", qualifications: [], relations: [], mandatory: true,
  };
  let invalidAuditSpanRejected = false;
  try {
    await createStyleTransferRequestPreparer(fakeRouter(validExtraction, { missingPropositions: [invalidAuditSpan], missingRelations: [] }), routes, {
      analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 },
    })({ requestId: "bad-audit-span", sourceText: source, donorText: donor });
  } catch (error) { invalidAuditSpanRejected = String(error).includes("Semantic completeness audit failed source-bound validation"); }
  assert(invalidAuditSpanRejected, "audit omissions must be tied to exact source spans");
  names.push("reject audit omissions without exact source evidence");

  let interpretationIssueRejected = false;
  const attributionIssue = {
    propositionId: "p2",
    field: "attribution",
    evidenceSpan: { start: 26, end: source.length, text: source.slice(26) },
    explanation: "Не подтверждается, что слова принадлежат автору, а не цитируемому лицу.",
  };
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(validExtraction, { missingPropositions: [], missingRelations: [] }, interpretationAudit(["p1", "p2"], [attributionIssue])),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "misattribution", sourceText: source, donorText: donor });
  } catch (error) { interpretationIssueRejected = String(error).includes("potential source-interpretation error"); }
  assert(interpretationIssueRejected, "an evidence-backed interpretation finding must stop preparation");
  names.push("stop preparation when independent interpretation audit finds a source mismatch");

  let incompleteInterpretationRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(validExtraction, { missingPropositions: [], missingRelations: [] }, interpretationAudit(["p1"])),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "incomplete-interpretation", sourceText: source, donorText: donor });
  } catch (error) { incompleteInterpretationRejected = String(error).includes("не подтвердил проверку пропозиции p2"); }
  assert(incompleteInterpretationRejected, "interpretation audit must account for every proposition");
  names.push("reject interpretation audits that omit proposition IDs");


  let structuralIssueRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        validExtraction,
        { missingPropositions: [], missingRelations: [] },
        interpretationAudit(["p1", "p2"]),
        structureAudit(["p1", "p2"], [{
          kind: "temporal-order", propositionIds: ["p1", "p2"],
          evidenceSpan: { start: 26, end: source.length, text: source.slice(26) },
          explanation: "Нарушена последовательность событий.",
        }]),
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "structure-issue", sourceText: source, donorText: donor });
  } catch (error) {
    structuralIssueRejected = String(error).includes("confirmed structural issue");
  }
  assert(structuralIssueRejected, "a validated structural finding must stop preparation");
  names.push("stop preparation when independent audit finds a structural issue");

  let incompleteStructureRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(validExtraction, { missingPropositions: [], missingRelations: [] }, interpretationAudit(["p1", "p2"]), structureAudit(["p1"])),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "incomplete-structure", sourceText: source, donorText: donor });
  } catch (error) {
    incompleteStructureRejected = String(error).includes("не подтвердил проверку пропозиции p2");
  }
  assert(incompleteStructureRejected, "structure audit must account for every proposition");
  names.push("reject structural audits that omit proposition IDs");

  let uncoveredSourceRejected = false;
  try {
    await createStyleTransferRequestPreparer(fakeRouter([validExtraction[0]], { missingPropositions: [], missingRelations: [] }, interpretationAudit(["p1"]), structureAudit(["p1"])), routes, {
      analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 },
    })({ requestId: "uncovered", sourceText: source, donorText: donor });
  } catch (error) { uncoveredSourceRejected = String(error).includes("source segment(s) without any proposition coverage"); }
  assert(uncoveredSourceRejected, "every source sentence must be represented after the omission audit");
  names.push("reject source sentences left uncovered after completeness audit");

  const invalid = validExtraction.map((item, index) => ({ ...item, id: index ? "p1" : item.id }));
  let duplicateRejected = false;
  try {
    await createStyleTransferRequestPreparer(fakeRouter(invalid), routes, {
      analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 },
    })({ requestId: "bad", sourceText: source, donorText: donor });
  } catch (error) { duplicateRejected = String(error).includes("ID повторяется"); }
  assert(duplicateRejected, "duplicate proposition IDs must be rejected");
  names.push("reject duplicate proposition identifiers");

  const badSpan = validExtraction.map((item, index) => index ? item : {
    ...item, sourceSpan: { ...item.sourceSpan, text: "not the source" },
  });
  let spanRejected = false;
  try {
    await createStyleTransferRequestPreparer(fakeRouter(badSpan), routes, {
      analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 },
    })({ requestId: "bad-span", sourceText: source, donorText: donor });
  } catch (error) { spanRejected = String(error).includes("sourceSpan не совпадает"); }
  assert(spanRejected, "non-literal source spans must be rejected");
  names.push("reject proposition spans not matching source text");

  let donorRejected = false;
  try {
    await createStyleTransferRequestPreparer(fakeRouter(validExtraction, { missingPropositions: [], missingRelations: [] }, interpretationAudit(["p1", "p2"]), structureAudit(["p1", "p2"])), routes)({
      requestId: "short-donor", sourceText: source, donorText: "Короткий образец.",
    });
  } catch (error) { donorRejected = String(error).includes("Donor corpus is insufficient"); }
  assert(donorRejected, "insufficient donor corpus must be rejected");
  names.push("reject insufficient donor corpus");

  let cancelled = false;
  const controller = new AbortController();
  controller.abort();
  try {
    await prepare({ requestId: "cancelled", sourceText: source, donorText: donor, signal: controller.signal });
  } catch { cancelled = true; }
  assert(cancelled, "pre-cancelled requests must stop before model extraction");
  names.push("stop before extraction when request is cancelled");

  const anchoredSource = "Дождь пошёл, поэтому путники укрылись.";
  const shiftedExtraction = [
    {
      id: 1,
      summary: "Дождь пошёл",
      sourceSpan: { start: 99, end: 110, text: "Дождь пошёл" },
      subject: "Дождь",
      predicate: "пошёл",
      object: null,
      polarity: "positive",
      modality: null,
      qualifications: [],
      relations: [{ kind: "cause", from: 1, to: 2, expression: null }],
      mandatory: true,
    },
    {
      id: 2,
      summary: "Путники укрылись",
      sourceSpan: { start: 0, end: 5, text: "путники укрылись." },
      subject: "путники",
      predicate: "укрылись",
      polarity: "positive",
      qualifications: [],
      relations: [{ kind: "cause", from: 1, to: 2, expression: "поэтому" }],
      mandatory: true,
    },
  ];
  const spacedRelationKeys = [
    "[\"cause\", \"p1\", \"p2\", \"\"]",
    "[\"cause\", \"p1\", \"p2\", \"поэтому\"]",
  ];
  const anchored = await createStyleTransferRequestPreparer(
    fakeRouter(
      shiftedExtraction,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1", "p2"]),
      { checkedPropositionIds: ["p1", "p2"], checkedRelationKeys: spacedRelationKeys, issues: [] },
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "anchored", sourceText: anchoredSource, donorText: donor });
  assert(
    anchored.inventory.propositions.length === 2 &&
    anchored.inventory.propositions[0].id === "p1" &&
    anchored.inventory.propositions[0].sourceSpan.start === 0 &&
    anchored.inventory.propositions[1].sourceSpan.start === anchoredSource.indexOf("путники укрылись."),
    "verbatim extraction spans, numeric IDs and spaced relation keys must normalize cleanly",
  );
  names.push("anchor verbatim spans and normalize LLM IDs/nulls during preparation");

  const imperfectQuote = validExtraction.map((item, index) => index === 0
    ? { ...item, sourceSpan: { start: 0, end: 25, text: "Святитель пришел в город" } }
    : item);
  const repairedSpans = validExtraction.map((item) => ({ id: item.id, sourceSpan: item.sourceSpan }));
  const repairedPreparation = await createStyleTransferRequestPreparer(
    fakeRouter(
      imperfectQuote,
      repairedSpans,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1", "p2"]),
      structureAudit(["p1", "p2"]),
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "span-repair", sourceText: source, donorText: donor });
  assert(
    repairedPreparation.inventory.propositions.length === 2 &&
    repairedPreparation.inventory.propositions[0].sourceSpan.text === source.slice(0, 25),
    "a bounded repair pass must replace an inexact quote with a verbatim source span",
  );
  names.push("repair inexact model quotations using exact source text before strict validation");

  let inventedRepairRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        imperfectQuote,
        repairedSpans.map((item, index) => index === 0
          ? { ...item, sourceSpan: { start: 0, end: 25, text: "выдуманная цитата" } }
          : item),
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "span-repair-invalid", sourceText: source, donorText: donor });
  } catch (error) {
    inventedRepairRejected = String(error).includes("Semantic extraction failed source-bound validation");
  }
  assert(inventedRepairRejected, "span repair must not allow invented or paraphrased evidence");
  names.push("reject repaired spans that are not literal substrings of the source");

  const falsePositiveRelation = {
    kind: "relation-omission", propositionIds: ["p1", "p2"],
    evidenceSpan: { start: 0, end: source.length, text: source },
    explanation: "Предположительно отсутствует межпропозиционная связь.",
  };
  const falsePositivePrepared = await createStyleTransferRequestPreparer(
    fakeRouter(
      validExtraction, { missingPropositions: [], missingRelations: [] }, interpretationAudit(["p1", "p2"]),
      structureAudit(["p1", "p2"], [falsePositiveRelation]),
      { decisions: [{ issueIndex: 0, classification: "already-represented", explanation: "Связь уже представлена в содержании пропозиций." }] },
    ), routes, { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "relation-false-positive", sourceText: source, donorText: donor });
  assert(falsePositivePrepared.inventory.propositions.length === 2, "an adjudicated internal modifier must not block preparation");
  names.push("dismiss relation-omission false positives when the meaning is already represented");

  let genuineOmissionRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        validExtraction, { missingPropositions: [], missingRelations: [] }, interpretationAudit(["p1", "p2"]),
        structureAudit(["p1", "p2"], [falsePositiveRelation]),
        { decisions: [{ issueIndex: 0, classification: "genuine-missing", explanation: "Явная связь между самостоятельными утверждениями отсутствует в relations." }] },
      ), routes, { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "relation-genuine-omission", sourceText: source, donorText: donor });
  } catch (error) { genuineOmissionRejected = String(error).includes("confirmed structural issue"); }
  assert(genuineOmissionRejected, "a confirmed missing cross-proposition relation must still stop preparation");
  names.push("retain fail-closed behavior for independently confirmed missing relations");

  let incompleteAdjudicationRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        validExtraction, { missingPropositions: [], missingRelations: [] }, interpretationAudit(["p1", "p2"]),
        structureAudit(["p1", "p2"], [falsePositiveRelation]),
        { decisions: [] },
      ), routes, { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "relation-incomplete-adjudication", sourceText: source, donorText: donor });
  } catch (error) { incompleteAdjudicationRejected = String(error).includes("did not decide every candidate"); }
  assert(incompleteAdjudicationRejected, "an incomplete adjudication must fail closed");
  names.push("fail closed when the second-pass relation adjudication is incomplete");
  const relationSource = "Дождь пошёл, поэтому путники укрылись.";
  const relationExtraction = [
    { id: "p1", summary: "Дождь пошёл", sourceSpan: { start: 0, end: "Дождь пошёл".length, text: "Дождь пошёл" }, subject: "Дождь", predicate: "пошёл", polarity: "positive", qualifications: [], relations: [], mandatory: true },
    { id: "p2", summary: "Путники укрылись", sourceSpan: { start: relationSource.indexOf("путники"), end: relationSource.length, text: "путники укрылись." }, subject: "путники", predicate: "укрылись", polarity: "positive", qualifications: [], relations: [], mandatory: true },
  ];
  const causeKey = JSON.stringify(["cause", "p1", "p2", "поэтому"]);
  const recovered = await createStyleTransferRequestPreparer(
    fakeRouter(relationExtraction,
      { missingPropositions: [], missingRelations: [{ kind: "cause", from: "p1", to: "p2", expression: "поэтому" }] },
      interpretationAudit(["p1", "p2"]),
      { checkedPropositionIds: ["p1", "p2"], checkedRelationKeys: [causeKey], issues: [] }),
    routes, { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "recover-missing-relation", sourceText: relationSource, donorText: donor });
  assert(recovered.inventory.propositions.find((item) => item.id === "p1")?.relations.some(
    (relation) => relation.kind === "cause" && relation.from === "p1" && relation.to === "p2" && relation.expression === "поэтому"),
    "the audit must restore a source-grounded relation between existing propositions");
  names.push("recover missing cross-proposition relations between existing propositions");

  let fabricatedMarkerRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(relationExtraction, { missingPropositions: [], missingRelations: [{ kind: "cause", from: "p1", to: "p2", expression: "выдуманный маркер" }] }),
      routes, { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "fabricated-marker", sourceText: relationSource, donorText: donor });
  } catch (error) { fabricatedMarkerRejected = String(error).includes("expression отсутствует в исходном тексте"); }
  assert(fabricatedMarkerRejected, "invented relation evidence must be rejected");
  names.push("reject fabricated evidence for recovered relations");

  let conflictingMarkerRejected = false;
  try {
    const conflictSource = "Дождь пошёл, поэтому путники укрылись, потому что стало холодно.";
    const conflictExtraction = [
      { ...relationExtraction[0], relations: [{ kind: "cause", from: "p1", to: "p2", expression: "поэтому" }] },
      { ...relationExtraction[1], sourceSpan: { start: conflictSource.indexOf("путники"), end: conflictSource.indexOf(", потому что"), text: "путники укрылись" }, relations: [{ kind: "cause", from: "p2", to: "p3", expression: "потому что" }] },
      { id: "p3", summary: "Стало холодно", sourceSpan: { start: conflictSource.indexOf("стало"), end: conflictSource.length, text: "стало холодно." }, subject: "неопределённое", predicate: "стало холодно", polarity: "positive", qualifications: [], relations: [], mandatory: true },
    ];
    await createStyleTransferRequestPreparer(
      fakeRouter(conflictExtraction, { missingPropositions: [], missingRelations: [{ kind: "cause", from: "p1", to: "p2", expression: "потому что" }] }),
      routes, { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "conflicting-marker", sourceText: conflictSource, donorText: donor });
  } catch (error) { conflictingMarkerRejected = String(error).includes("conflicting evidence for relation"); }
  assert(conflictingMarkerRejected, "conflicting non-empty evidence for the same directed edge must not be duplicated");
  names.push("reject conflicting evidence for an existing directed relation");

  const idempotent = await createStyleTransferRequestPreparer(
    fakeRouter(
      relationExtraction.map((item, index) => index === 0 ? { ...item, relations: [{ kind: "cause", from: "p1", to: "p2", expression: "поэтому" }] } : item),
      { missingPropositions: [], missingRelations: [{ kind: "cause", from: "p1", to: "p2", expression: "поэтому" }] },
      interpretationAudit(["p1", "p2"]),
      { checkedPropositionIds: ["p1", "p2"], checkedRelationKeys: [causeKey], issues: [] }),
    routes, { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "idempotent-relation", sourceText: relationSource, donorText: donor });
  assert(idempotent.inventory.propositions.find((item) => item.id === "p1")?.relations.length === 1,
    "reprocessing an existing relation must not append a duplicate");
  names.push("make repeated relation recovery idempotent");

  let leadingMarkerAccepted = false;
  try {
    const leadingSource = "Поскольку дождь пошёл, путники укрылись.";
    const rainStart = leadingSource.indexOf("дождь"), travelersStart = leadingSource.indexOf("путники");
    const leadingExtraction = [
      { id: "p1", summary: "Дождь пошёл", sourceSpan: { start: rainStart, end: leadingSource.indexOf(","), text: leadingSource.slice(rainStart, leadingSource.indexOf(",")) }, subject: "дождь", predicate: "пошёл", polarity: "positive", qualifications: [], relations: [], mandatory: true },
      { id: "p2", summary: "Путники укрылись", sourceSpan: { start: travelersStart, end: leadingSource.length, text: leadingSource.slice(travelersStart) }, subject: "путники", predicate: "укрылись", polarity: "positive", qualifications: [], relations: [], mandatory: true },
    ];
    const leadingRelationKey = JSON.stringify(["cause", "p1", "p2", "Поскольку"]);
    const leadingResult = await createStyleTransferRequestPreparer(
      fakeRouter(
        leadingExtraction,
        { missingPropositions: [], missingRelations: [{ kind: "cause", from: "p1", to: "p2", expression: "Поскольку" }] },
        interpretationAudit(["p1", "p2"]),
        { checkedPropositionIds: ["p1", "p2"], checkedRelationKeys: [leadingRelationKey], issues: [] },
      ),
      routes, { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "leading-marker", sourceText: leadingSource, donorText: donor });
    leadingMarkerAccepted = leadingResult.inventory.propositions.some((item) => item.relations.some((relation) => relation.expression === "Поскольку"));
  } catch { leadingMarkerAccepted = false; }
  assert(leadingMarkerAccepted, "a connective before the first proposition is valid when it is in the same sentence");
  names.push("accept a relation marker at the beginning of the endpoint sentence");

  let unrelatedSentenceMarkerRejected = false;
  try {
    const distantSource = "Однако. Дождь пошёл, путники укрылись.";
    const p1Start = distantSource.indexOf("Дождь пошёл"), p2Start = distantSource.indexOf("путники укрылись");
    const distantExtraction = [
      { id: "p1", summary: "Дождь пошёл", sourceSpan: { start: p1Start, end: p1Start + "Дождь пошёл".length, text: "Дождь пошёл" }, subject: "Дождь", predicate: "пошёл", polarity: "positive", qualifications: [], relations: [], mandatory: true },
      { id: "p2", summary: "Путники укрылись", sourceSpan: { start: p2Start, end: distantSource.length, text: distantSource.slice(p2Start) }, subject: "путники", predicate: "укрылись", polarity: "positive", qualifications: [], relations: [], mandatory: true },
    ];
    await createStyleTransferRequestPreparer(
      fakeRouter(distantExtraction, { missingPropositions: [], missingRelations: [{ kind: "contrast", from: "p1", to: "p2", expression: "Однако" }] }),
      routes, { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "unrelated-sentence-marker", sourceText: distantSource, donorText: donor });
  } catch (error) {
    unrelatedSentenceMarkerRejected = String(error).includes("expression не находится в предложении одной из связанных пропозиций");
  }
  assert(unrelatedSentenceMarkerRejected, "a marker in an unrelated sentence must not justify a relation");
  names.push("reject relation markers in unrelated sentences");

  let missingMarkerRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(relationExtraction, { missingPropositions: [], missingRelations: [{ kind: "cause", from: "p1", to: "p2" }] }),
      routes, { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "missing-marker", sourceText: relationSource, donorText: donor });
  } catch (error) {
    missingMarkerRejected = String(error).includes("expression обязателен");
  }
  assert(missingMarkerRejected, "recovered relations must include exact textual evidence");
  names.push("require verbatim evidence for every recovered relation");

  return { passed: names.length, names };
}

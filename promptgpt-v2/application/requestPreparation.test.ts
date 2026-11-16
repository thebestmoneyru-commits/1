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

  const repairableInterpretationIssue = {
    propositionId: "p1",
    field: "object",
    evidenceSpan: {
      start: source.indexOf("людям"),
      end: source.indexOf("людям") + "людям".length,
      text: "людям",
    },
    explanation: "Проверить объект первой пропозиции по исходному фрагменту.",
  };
  let repairedInterpretationAuditReachedSemanticGate = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        validExtraction,
        { missingPropositions: [], missingRelations: [] },
        interpretationAudit(["p1"], [repairableInterpretationIssue]),
        interpretationAudit(["p1", "p2"], [{
          ...repairableInterpretationIssue,
          evidenceSpan: {
            start: source.indexOf("город"),
            end: source.indexOf("город") + "город".length,
            text: "город",
          },
        }]),
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "bounded-interpretation-audit-repair", sourceText: source, donorText: donor });
  } catch (error) {
    repairedInterpretationAuditReachedSemanticGate =
      String(error).includes("Semantic interpretation audit found") &&
      !String(error).includes("failed validation");
  }
  assert(
    repairedInterpretationAuditReachedSemanticGate,
    "one bounded audit repair must correct checked IDs and evidence anchors without suppressing the original semantic finding",
  );
  names.push("repair interpretation-audit bookkeeping and evidence anchors once while preserving immutable findings");

  const sharedPredicateSource = "Общая причина влечет за собой упразднение моральной ответственности и превращение исторического процесса в механическую последовательность фактов.";
  const firstObject = "упразднение моральной ответственности";
  const secondObject = "превращение исторического процесса в механическую последовательность фактов";
  const sharedPredicateStart = sharedPredicateSource.indexOf("влечет за собой");
  const firstObjectStart = sharedPredicateSource.indexOf(firstObject);
  const secondObjectStart = sharedPredicateSource.indexOf(secondObject);
  const sharedPredicateExtraction = [
    {
      id: "p1", summary: "Причина влечет за собой упразднение ответственности",
      sourceSpan: { start: sharedPredicateStart, end: firstObjectStart + firstObject.length, text: sharedPredicateSource.slice(sharedPredicateStart, firstObjectStart + firstObject.length) },
      subject: "Общая причина", predicate: "влечет за собой", object: firstObject,
      polarity: "positive", qualifications: [], relations: [], mandatory: true,
    },
    {
      id: "p2", summary: "Причина влечет за собой превращение исторического процесса",
      sourceSpan: { start: secondObjectStart, end: secondObjectStart + secondObject.length, text: secondObject },
      subject: "Общая причина", predicate: "влечет за собой", object: secondObject,
      polarity: "positive", qualifications: [], relations: [], mandatory: true,
    },
  ];
  const sharedPredicateIssue = {
    propositionId: "p2", field: "predicate",
    evidenceSpan: { start: sharedPredicateStart, end: sharedPredicateStart + "влечет за собой".length, text: "влечет за собой" },
    explanation: "Сказуемое отсутствует в узком sourceSpan второй однородной пропозиции, но явно выражено в том же предложении.",
  };
  const sharedPredicatePrepared = await createStyleTransferRequestPreparer(
    fakeRouter(
      sharedPredicateExtraction,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1", "p2"], [sharedPredicateIssue]),
      { decisions: [{ issueIndex: 0, classification: "already-grounded-in-sentence", explanation: "Общее сказуемое синтаксически относится к обоим однородным дополнениям." }] },
      structureAudit(["p1", "p2"]),
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "shared-predicate-grounded", sourceText: sharedPredicateSource, donorText: donor });
  assert(
    sharedPredicatePrepared.inventory.propositions.find((item) => item.id === "p2")?.sourceSpan.text === secondObject,
    "shared predicate adjudication must preserve the narrow verbatim sourceSpan",
  );
  names.push("accept a shared predicate grounded in the containing sentence without widening sourceSpan");

  let sharedPredicateMismatchRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        sharedPredicateExtraction,
        { missingPropositions: [], missingRelations: [] },
        interpretationAudit(["p1", "p2"], [sharedPredicateIssue]),
        { decisions: [{ issueIndex: 0, classification: "genuine-mismatch", explanation: "The predicate is not syntactically licensed for this proposition." }] },
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "shared-predicate-genuine-mismatch", sourceText: sharedPredicateSource, donorText: donor });
  } catch (error) {
    sharedPredicateMismatchRejected = String(error).includes("Semantic interpretation audit found");
  }
  assert(sharedPredicateMismatchRejected, "a genuine shared-predicate mismatch must remain blocking");
  names.push("retain fail-closed behavior for genuine shared-predicate mismatches");

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

  const evidencePreservationSource = "Дождь пошёл, поэтому путники укрылись.";
  const evidencePreservationExtraction = [
    {
      id: "p1", summary: "Дождь пошёл",
      sourceSpan: { start: 0, end: "Дождь пошёл".length, text: "Дождь пошёл" },
      subject: "Дождь", predicate: "пошёл", polarity: "positive", qualifications: [],
      relations: [{ kind: "cause", from: "p1", to: "p1", expression: "поэтому" }], mandatory: true,
    },
    {
      id: "p2", summary: "Путники укрылись",
      sourceSpan: { start: evidencePreservationSource.indexOf("путники"), end: evidencePreservationSource.length, text: "путники укрылись." },
      subject: "путники", predicate: "укрылись", polarity: "positive", qualifications: [],
      relations: [], mandatory: true,
    },
  ];
  const evidencePreserved = await createStyleTransferRequestPreparer(
    fakeRouter(
      evidencePreservationExtraction,
      [
        { id: "p1", relations: [{ kind: "cause", from: "p1", to: "p2" }] },
        { id: "p2", relations: [] },
      ],
    ),
    routes,
    {
      completenessAudit: false,
      interpretationAudit: false,
      structureAudit: false,
      analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 },
    },
  )({ requestId: "preserve-relation-evidence", sourceText: evidencePreservationSource, donorText: donor });
  assert(
    evidencePreserved.inventory.propositions.find((item) => item.id === "p1")?.relations.some(
      (relation) => relation.kind === "cause" && relation.from === "p1" &&
        relation.to === "p2" && relation.expression === "поэтому",
    ),
    "a relation repair that omits an optional expression must preserve the original verbatim evidence",
  );
  names.push("preserve original relation evidence when a bounded repair omits the optional expression");


  const omissionSource = "Святитель пришёл в город. Он помог людям. Он основал обитель.";
  const omissionFirstEnd = omissionSource.indexOf(".") + 1;
  const omissionSecondStart = omissionSource.indexOf("Он помог");
  const omissionSecondEnd = omissionSource.indexOf(". ", omissionSecondStart) + 1;
  const omissionThirdStart = omissionSource.indexOf("Он основал");
  const omissionExtraction = [
    {
      id: "p1", summary: "Святитель пришёл в город",
      sourceSpan: { start: 0, end: omissionFirstEnd, text: omissionSource.slice(0, omissionFirstEnd) },
      subject: "Святитель", predicate: "пришёл", object: "в город", polarity: "positive",
      qualifications: [], relations: [], mandatory: true,
    },
    {
      id: "p2", summary: "Он помог людям",
      sourceSpan: { start: omissionSecondStart, end: omissionSecondEnd, text: omissionSource.slice(omissionSecondStart, omissionSecondEnd) },
      subject: "Он", predicate: "помог", object: "людям", polarity: "positive",
      qualifications: [], relations: [], mandatory: true,
    },
  ];
  const omitted = {
    id: "p3", summary: "Он основал обитель",
    sourceSpan: { start: omissionThirdStart, end: omissionSource.length, text: omissionSource.slice(omissionThirdStart) },
    subject: "Он", predicate: "основал", object: "обитель", polarity: "positive",
    qualifications: [], relations: [], mandatory: true,
  };
  const audited = await createStyleTransferRequestPreparer(
    fakeRouter(
      omissionExtraction,
      { missingPropositions: [omitted], missingRelations: [] },
      interpretationAudit(["p1", "p2", "p3"]),
      structureAudit(["p1", "p2", "p3"]),
    ), routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "audit", sourceText: omissionSource, donorText: donor });
  assert(audited.inventory.propositions.length === 3, "omission audit must add validated missing propositions");
  assert(audited.inventory.propositions.some((item) => item.id === "p3"), "audited omission must be retained");
  names.push("recover source-grounded omissions found by independent audit");

  let unsupportedOmissionRejected = false;
  const unsupportedOmission = {
    ...omitted,
    summary: "Он прославился многочисленными чудесами",
    predicate: "прославился многочисленными чудесами",
    object: undefined,
  };
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        omissionExtraction,
        { missingPropositions: [unsupportedOmission], missingRelations: [] },
        interpretationAudit(["p1", "p2", "p3"], [{
          propositionId: "p3",
          field: "predicate",
          evidenceSpan: {
            start: omissionThirdStart,
            end: omissionSource.length,
            text: omissionSource.slice(omissionThirdStart),
          },
          explanation: "Предикат не соответствует буквальному содержанию исходного фрагмента.",
        }]),
        structureAudit(["p1", "p2", "p3"]),
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "reject-unsupported-omission", sourceText: omissionSource, donorText: donor });
  } catch (error) {
    unsupportedOmissionRejected = String(error).includes("potential source-interpretation error");
  }
  assert(
    unsupportedOmissionRejected,
    "a literal source span must not legitimize an invented proposition when the interpretation audit flags its meaning",
  );
  names.push("reject semantically unsupported propositions recovered by the completeness audit");

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

  const modalitySource = "Это неизбежно происходит.";
  const modalityExtraction = [{
    id: "p1", summary: "Это неизбежно происходит",
    sourceSpan: { start: 0, end: modalitySource.length, text: modalitySource },
    subject: "Это", predicate: "неизбежно происходит", polarity: "positive",
    qualifications: [], relations: [], mandatory: true,
  }];
  const modalityIssue = {
    propositionId: "p1", field: "modality",
    evidenceSpan: { start: modalitySource.indexOf("неизбежно"), end: modalitySource.indexOf("неизбежно") + "неизбежно".length, text: "неизбежно" },
    explanation: "Не отражена модальность необходимости.",
  };
  const alreadyPreservedModality = await createStyleTransferRequestPreparer(
    fakeRouter(
      modalityExtraction,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1"], [modalityIssue]),
      { decisions: [{ issueIndex: 0, classification: "already-preserved", explanation: "Слово неизбежно уже включено в predicate." }] },
      { checkedPropositionIds: ["p1"], checkedRelationKeys: [], issues: [] },
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "modality-already-preserved", sourceText: modalitySource, donorText: donor });
  assert(
    alreadyPreservedModality.inventory.propositions[0].predicate === "неизбежно происходит",
    "a modality marker already represented in predicate must not be rejected for lacking a duplicate modality object",
  );
  names.push("dismiss modality false positives when the complete modal meaning is already in predicate");

  let genuineModalityMismatchRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        [{ ...modalityExtraction[0], predicate: "происходит" }],
        { missingPropositions: [], missingRelations: [] },
        interpretationAudit(["p1"], [modalityIssue]),
        { decisions: [{ issueIndex: 0, classification: "genuine-mismatch", explanation: "Предикат не сохраняет маркер необходимости." }] },
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "modality-genuine-mismatch", sourceText: modalitySource, donorText: donor });
  } catch (error) {
    genuineModalityMismatchRejected = String(error).includes("potential source-interpretation error");
  }
  assert(genuineModalityMismatchRejected, "a genuinely omitted modal meaning must remain blocking");
  names.push("retain fail-closed behavior when a modality mismatch is independently confirmed");

  const misattachedSource = "Прежний тезис неверен. Обещая материальное преуспеяние, концепция, тем не менее, остаётся бессильной.";
  const misattachedExtraction = [
    {
      id: "p16", summary: "Прежний тезис неверен",
      sourceSpan: { start: 0, end: misattachedSource.indexOf(".") + 1, text: "Прежний тезис неверен." },
      subject: "Прежний тезис", predicate: "неверен", polarity: "negative",
      qualifications: [], relations: [], mandatory: true,
    },
    {
      id: "p17", summary: "Концепция остаётся бессильной",
      sourceSpan: { start: misattachedSource.indexOf("концепция"), end: misattachedSource.length, text: misattachedSource.slice(misattachedSource.indexOf("концепция")) },
      subject: "концепция", predicate: "остаётся бессильной", polarity: "negative",
      qualifications: [],
      relations: [{ kind: "concession", from: "p16", to: "p17", expression: "тем не менее" }],
      mandatory: true,
    },
  ];
  const recoveredConcessionClause = {
    id: "p22", summary: "Концепция обещает материальное преуспеяние",
    sourceSpan: { start: misattachedSource.indexOf("Обещая"), end: misattachedSource.indexOf(", концепция"), text: "Обещая материальное преуспеяние" },
    subject: "концепция", predicate: "обещает", object: "материальное преуспеяние", polarity: "positive",
    qualifications: [], relations: [], mandatory: true,
  };
  const logicalRelationIssue = {
    propositionId: "p17",
    field: "logical-relation",
    evidenceSpan: {
      start: misattachedSource.indexOf("тем не менее"),
      end: misattachedSource.indexOf("тем не менее") + "тем не менее".length,
      text: "тем не менее",
    },
    explanation: "Отношение 'concession' ('тем не менее') связывает p22 и p17, а ссылка на p16 ошибочна.",
  };
  const repairedConcessionKey = JSON.stringify(["concession", "p22", "p17", "тем не менее"]);
  const repairedLogicalRelation = await createStyleTransferRequestPreparer(
    fakeRouter(
      misattachedExtraction,
      { missingPropositions: [recoveredConcessionClause], missingRelations: [] },
      interpretationAudit(["p16", "p17", "p22"], [logicalRelationIssue]),
      {
        decisions: [{
          issueIndex: 0,
          action: "replace-relations",
          repairedRelations: [{ kind: "concession", from: "p22", to: "p17", expression: "тем не менее" }],
          explanation: "Переподключена уступительная связь с p22 на p17.",
        }],
      },
      { checkedPropositionIds: ["p16", "p17", "p22"], checkedRelationKeys: [repairedConcessionKey], issues: [] },
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "repair-logical-relation", sourceText: misattachedSource, donorText: donor });
  const repairedP17 = repairedLogicalRelation.inventory.propositions.find((item) => item.id === "p17");
  assert(
    repairedP17?.relations.length === 1 &&
    repairedP17.relations[0].from === "p22" &&
    repairedP17.relations[0].to === "p17" &&
    repairedP17.relations[0].expression === "тем не менее",
    "logical-relation adjudication must repair misattached endpoints while keeping proposition content intact",
  );
  names.push("repair misattached logical-relation endpoints caught by interpretation audit");

  let genuineLogicalRelationRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        misattachedExtraction,
        { missingPropositions: [recoveredConcessionClause], missingRelations: [] },
        interpretationAudit(["p16", "p17", "p22"], [logicalRelationIssue]),
        { decisions: [{ issueIndex: 0, action: "genuine-mismatch", explanation: "Логическая связь противоречит исходнику." }] },
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "reject-genuine-logical-relation", sourceText: misattachedSource, donorText: donor });
  } catch (error) {
    genuineLogicalRelationRejected = String(error).includes("potential source-interpretation error");
  }
  assert(genuineLogicalRelationRejected, "confirmed logical-relation mismatches must stop preparation");
  names.push("retain fail-closed behavior when logical-relation mismatch is confirmed");

  let invalidRelationRepairRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        misattachedExtraction,
        { missingPropositions: [recoveredConcessionClause], missingRelations: [] },
        interpretationAudit(["p16", "p17", "p22"], [logicalRelationIssue]),
        {
          decisions: [{
            issueIndex: 0,
            action: "replace-relations",
            repairedRelations: [{ kind: "concession", from: "p99", to: "p17", expression: "тем не менее" }],
            explanation: "Неверная замена на неизвестный ID.",
          }],
        },
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "reject-invalid-logical-relation-repair", sourceText: misattachedSource, donorText: donor });
  } catch (error) {
    invalidRelationRepairRejected = String(error).includes("неизвестную пропозицию");
  }
  assert(invalidRelationRepairRejected, "invalid logical-relation repairs must fail source-bound validation");
  names.push("reject invalid logical-relation replacements from adjudication");

  const sharedVerbSource = "Редукция влечет за собой упразднение моральной ответственности и превращение исторического процесса в механическую последовательность фактов.";
  const sharedObject2Text = "превращение исторического процесса в механическую последовательность фактов.";
  const sharedObject2Start = sharedVerbSource.indexOf(sharedObject2Text);
  const sharedVerbExtraction = [
    {
      id: "p13",
      summary: "Редукция влечет за собой упразднение моральной ответственности",
      sourceSpan: { start: 0, end: sharedVerbSource.indexOf(" и превращение"), text: sharedVerbSource.slice(0, sharedVerbSource.indexOf(" и превращение")) },
      subject: "Редукция", predicate: "влечет за собой", object: "упразднение моральной ответственности", polarity: "positive",
      qualifications: [], relations: [], mandatory: true,
    },
    {
      id: "p14",
      summary: "Редукция влечет за собой превращение исторического процесса в механическую последовательность фактов",
      sourceSpan: { start: sharedObject2Start, end: sharedVerbSource.length, text: sharedObject2Text },
      subject: "Редукция", predicate: "влечет за собой", object: "превращение исторического процесса в механическую последовательность фактов", polarity: "positive",
      qualifications: [], relations: [], mandatory: true,
    },
  ];
  const sharedVerbIssue = {
    propositionId: "p14",
    field: "predicate",
    evidenceSpan: { start: sharedObject2Start, end: sharedVerbSource.length, text: sharedObject2Text },
    explanation: "The predicate 'влечет за собой' is absent from the narrow object sourceSpan.",
  };
  const sharedPredicateAccepted = await createStyleTransferRequestPreparer(
    fakeRouter(
      sharedVerbExtraction,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p13", "p14"], [sharedVerbIssue]),
      { decisions: [{ issueIndex: 0, classification: "already-grounded-in-sentence", explanation: "Общий глагол «влечет за собой» находится в том же предложении и управляет обоими дополнениями." }] },
      structureAudit(["p13", "p14"]),
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "shared-predicate-grounded", sourceText: sharedVerbSource, donorText: donor });
  assert(
    sharedPredicateAccepted.inventory.propositions.find((item) => item.id === "p14")?.predicate === "влечет за собой",
    "shared predicate present earlier in the same sentence must be accepted after independent adjudication",
  );
  names.push("accept shared sentence predicate governing a narrow homogeneous-object span");

  let sharedVerbMismatchRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        sharedVerbExtraction,
        { missingPropositions: [], missingRelations: [] },
        interpretationAudit(["p13", "p14"], [sharedVerbIssue]),
        { decisions: [{ issueIndex: 0, classification: "genuine-mismatch", explanation: "Глагол в предложении относится к другому субъекту." }] },
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "shared-predicate-mismatch", sourceText: sharedVerbSource, donorText: donor });
  } catch (error) {
    sharedVerbMismatchRejected = String(error).includes("potential source-interpretation error");
  }
  assert(sharedVerbMismatchRejected, "a confirmed shared-constituent mismatch must still stop preparation");
  names.push("retain fail-closed behavior when shared sentence constituent is unconfirmed");

  const syntacticSplitSource = "В такой системе не остается места ни совести, ни этическому идеалу.";
  const syntacticSplitSpanText = "места ни совести, ни этическому идеалу";
  const syntacticSplitSpanStart = syntacticSplitSource.indexOf(syntacticSplitSpanText);
  const syntacticSplitExtraction = [{
    id: "m3",
    summary: "В системе не остается места ни совести, ни этическому идеалу",
    sourceSpan: { start: 0, end: syntacticSplitSource.length, text: syntacticSplitSource },
    subject: syntacticSplitSpanText,
    predicate: "не остается",
    polarity: "negative",
    qualifications: [{ kind: "place", value: "В такой системе" }],
    relations: [],
    mandatory: true,
  }];
  const syntacticSplitIssue = {
    propositionId: "m3",
    field: "subject",
    evidenceSpan: {
      start: syntacticSplitSpanStart,
      end: syntacticSplitSpanStart + syntacticSplitSpanText.length,
      text: syntacticSplitSpanText,
    },
    explanation: "Субъектом является слово «места», а «ни совести, ни этическому идеалу» — дополнения.",
  };
  const syntacticPreserved = await createStyleTransferRequestPreparer(
    fakeRouter(
      syntacticSplitExtraction,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["m3"], [syntacticSplitIssue]),
      { decisions: [{ issueIndex: 0, action: "semantic-preserved", explanation: "Смысл отрицательной бытийной конструкции полностью сохранён без подмены участников." }] },
      structureAudit(["m3"]),
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "syntactic-role-preserved", sourceText: syntacticSplitSource, donorText: donor });
  assert(syntacticPreserved.inventory.propositions[0].subject === syntacticSplitSpanText, "semantic-preserved must accept harmless syntactic grouping without blocking");
  names.push("dismiss in-span subject/predicate boundary disputes when meaning is preserved");

  const syntacticReassigned = await createStyleTransferRequestPreparer(
    fakeRouter(
      syntacticSplitExtraction,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["m3"], [syntacticSplitIssue]),
      {
        decisions: [{
          issueIndex: 0,
          action: "reassign-roles",
          repairedSubject: "места",
          repairedPredicate: "не остается",
          repairedObject: "ни совести, ни этическому идеалу",
          explanation: "Отделён субъект «места» от дополнения «ни совести, ни этическому идеалу».",
        }],
      },
      structureAudit(["m3"]),
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "syntactic-role-reassigned", sourceText: syntacticSplitSource, donorText: donor });
  assert(
    syntacticReassigned.inventory.propositions[0].subject === "места" &&
    syntacticReassigned.inventory.propositions[0].object === "ни совести, ни этическому идеалу" &&
    syntacticReassigned.inventory.propositions[0].sourceSpan.text === syntacticSplitSource,
    "reassign-roles must cleanly update subject/predicate/object while keeping sourceSpan immutable",
  );
  names.push("reassign in-span subject/predicate/object boundaries after independent adjudication");

  let syntacticMismatchRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        syntacticSplitExtraction,
        { missingPropositions: [], missingRelations: [] },
        interpretationAudit(["m3"], [syntacticSplitIssue]),
        { decisions: [{ issueIndex: 0, action: "genuine-mismatch", explanation: "Искажены участники действия." }] },
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "syntactic-role-genuine-mismatch", sourceText: syntacticSplitSource, donorText: donor });
  } catch (error) {
    syntacticMismatchRejected = String(error).includes("potential source-interpretation error");
  }
  assert(syntacticMismatchRejected, "confirmed genuine role mismatches must still stop preparation");
  names.push("retain fail-closed behavior for confirmed in-span subject/predicate mismatches");

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

  const outOfSpanAudit = interpretationAudit(["p1", "p2"], [{
    propositionId: "p2",
    field: "object",
    evidenceSpan: { start: 0, end: 25, text: source.slice(0, 25) },
    explanation: "Объект утверждения приписан по предыдущему предложению.",
  }]);
  let droppedIssueRepairRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        validExtraction,
        { missingPropositions: [], missingRelations: [] },
        outOfSpanAudit,
        interpretationAudit(["p1", "p2"], []),
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "reject-mutated-interpretation-repair", sourceText: source, donorText: donor });
  } catch (error) {
    droppedIssueRepairRejected = String(error).includes("changed the issue count");
  }
  assert(droppedIssueRepairRejected, "bounded interpretation repair must not silently drop findings");
  names.push("reject bounded interpretation audit repairs that drop existing findings");

  let persistentOutOfSpanRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        validExtraction,
        { missingPropositions: [], missingRelations: [] },
        outOfSpanAudit,
        outOfSpanAudit,
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "reject-unfixed-out-of-span", sourceText: source, donorText: donor });
  } catch (error) {
    persistentOutOfSpanRejected = String(error).includes("вне исходного свидетельства пропозиции p2");
  }
  assert(persistentOutOfSpanRejected, "unrepaired out-of-span interpretation citations must fail closed");
  names.push("reject interpretation audits whose out-of-span citation survives bounded repair");


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

  const relationTypeSource = "Святитель пришёл в город, однако он помог людям.";
  const relationTypeKey = JSON.stringify(["concession", "p1", "p2", "однако"]);
  const relationTypeExtraction = [
    {
      id: "p1", summary: "Святитель пришёл в город",
      sourceSpan: { start: 0, end: relationTypeSource.indexOf(","), text: "Святитель пришёл в город" },
      subject: "Святитель", predicate: "пришёл", object: "в город", polarity: "positive",
      qualifications: [], relations: [{ kind: "concession", from: "p1", to: "p2", expression: "однако" }], mandatory: true,
    },
    {
      id: "p2", summary: "Он помог людям",
      sourceSpan: { start: relationTypeSource.indexOf("он помог"), end: relationTypeSource.length, text: "он помог людям." },
      subject: "он", predicate: "помог", object: "людям", polarity: "positive",
      qualifications: [], relations: [], mandatory: true,
    },
  ];
  const relationTypeIssue = {
    kind: "relation-type", propositionIds: ["p1", "p2"], relationKey: relationTypeKey,
    evidenceSpan: {
      start: relationTypeSource.indexOf("однако"),
      end: relationTypeSource.indexOf("однако") + "однако".length,
      text: "однако",
    },
    explanation: "Тип отношения определён неверно.",
  };
  const relationTypeAudit = {
    checkedPropositionIds: ["p1", "p2"],
    checkedRelationKeys: [relationTypeKey],
    issues: [relationTypeIssue],
  };
  const removedRelation = await createStyleTransferRequestPreparer(
    fakeRouter(
      relationTypeExtraction,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1", "p2"]),
      relationTypeAudit,
      { decisions: [{ issueIndex: 0, action: "remove", explanation: "Это выражение относится к внутренней конструкции одной пропозиции." }] },
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "relation-type-remove", sourceText: relationTypeSource, donorText: donor });
  assert(
    removedRelation.inventory.propositions.every((item) => item.relations.length === 0),
    "a bounded relation-type repair must remove only the relation identified by the audit",
  );
  names.push("remove a falsely extracted cross-proposition relation after independent adjudication");

  const correctedRelation = await createStyleTransferRequestPreparer(
    fakeRouter(
      relationTypeExtraction,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1", "p2"]),
      relationTypeAudit,
      { decisions: [{ issueIndex: 0, action: "change-kind", correctedKind: "contrast", explanation: "Маркер однако выражает противопоставление." }] },
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "relation-type-change", sourceText: relationTypeSource, donorText: donor });
  assert(
    correctedRelation.inventory.propositions[0].relations.some((item) =>
      item.kind === "contrast" && item.from === "p1" && item.to === "p2" && item.expression === "однако"),
    "a bounded relation-type repair may change only the kind of the identified relation",
  );
  names.push("correct an audited relation kind without changing its endpoints or source evidence");

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

  const inversionSource = "Дождь пошёл, поэтому путники укрылись.";
  const inversionExtraction = [
    {
      id: "p1", summary: "Дождь пошёл",
      sourceSpan: { start: 0, end: "Дождь пошёл".length, text: "Дождь пошёл" },
      subject: "Дождь", predicate: "пошёл", polarity: "positive",
      qualifications: [], relations: [{ kind: "cause", from: "p2", to: "p1", expression: "поэтому" }], mandatory: true,
    },
    {
      id: "p2", summary: "Путники укрылись",
      sourceSpan: { start: inversionSource.indexOf("путники"), end: inversionSource.length, text: "путники укрылись." },
      subject: "путники", predicate: "укрылись", polarity: "positive",
      qualifications: [], relations: [], mandatory: true,
    },
  ];
  const invertedRelationKey = JSON.stringify(["cause", "p2", "p1", "поэтому"]);
  const inversionIssue = {
    kind: "relation-inversion",
    propositionIds: ["p1", "p2"],
    relationKey: invertedRelationKey,
    evidenceSpan: {
      start: inversionSource.indexOf("поэтому"),
      end: inversionSource.indexOf("поэтому") + "поэтому".length,
      text: "поэтому",
    },
    explanation: "Причина и следствие указаны в обратном направлении.",
  };
  const inversionAudit = {
    checkedPropositionIds: ["p1", "p2"],
    checkedRelationKeys: [invertedRelationKey],
    issues: [inversionIssue],
  };
  const correctedDirection = await createStyleTransferRequestPreparer(
    fakeRouter(
      inversionExtraction,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1", "p2"]),
      inversionAudit,
      { decisions: [{ issueIndex: 0, action: "reverse", explanation: "Дождь является причиной укрытия путников." }] },
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "relation-inversion-reverse", sourceText: inversionSource, donorText: donor });
  assert(
    correctedDirection.inventory.propositions[0].relations.some((relation) =>
      relation.kind === "cause" && relation.from === "p1" && relation.to === "p2" && relation.expression === "поэтому") &&
    correctedDirection.inventory.propositions[0].summary === inversionExtraction[0].summary &&
    correctedDirection.inventory.propositions[0].subject === inversionExtraction[0].subject &&
    correctedDirection.inventory.propositions[0].predicate === inversionExtraction[0].predicate &&
    correctedDirection.inventory.propositions[1].predicate === inversionExtraction[1].predicate,
    "a confirmed relation inversion must reverse only the identified relation endpoints and preserve proposition content",
  );
  names.push("reverse an independently confirmed relation direction without changing its kind or evidence");

  const dismissedInversion = await createStyleTransferRequestPreparer(
    fakeRouter(
      inversionExtraction,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1", "p2"]),
      inversionAudit,
      { decisions: [{ issueIndex: 0, action: "already-correct", explanation: "Направление соответствует исходному смыслу." }] },
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "relation-inversion-false-positive", sourceText: inversionSource, donorText: donor });
  assert(
    dismissedInversion.inventory.propositions[0].relations[0].from === "p2" &&
    dismissedInversion.inventory.propositions[0].relations[0].to === "p1",
    "an independently dismissed inversion finding must leave the existing relation unchanged",
  );
  names.push("dismiss a false-positive relation-inversion finding without mutating the relation");

  let genuineInversionRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        inversionExtraction,
        { missingPropositions: [], missingRelations: [] },
        interpretationAudit(["p1", "p2"]),
        inversionAudit,
        { decisions: [{ issueIndex: 0, action: "genuine-mismatch", explanation: "Направление нельзя подтвердить." }] },
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "relation-inversion-unresolved", sourceText: inversionSource, donorText: donor });
  } catch (error) {
    genuineInversionRejected = String(error).includes("confirmed structural issue");
  }
  assert(genuineInversionRejected, "an unresolved genuine inversion must remain blocking");
  names.push("retain fail-closed behavior for unresolved relation inversions");

  let incompleteInversionAdjudicationRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        inversionExtraction,
        { missingPropositions: [], missingRelations: [] },
        interpretationAudit(["p1", "p2"]),
        inversionAudit,
        { decisions: [] },
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "relation-inversion-incomplete", sourceText: inversionSource, donorText: donor });
  } catch (error) {
    incompleteInversionAdjudicationRejected = String(error).includes("did not decide every candidate");
  }
  assert(
    incompleteInversionAdjudicationRejected,
    "an inversion adjudicator that omits a candidate must not silently dismiss the finding",
  );
  names.push("fail closed when relation-inversion adjudication omits a candidate");

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

  const participialSource = "Модель обнаруживает несостоятельность, неизбежно сталкиваясь с жаждой вечности.";
  const participialComma = participialSource.indexOf(", неизбежно");
  const participialSecondStart = participialSource.indexOf("неизбежно");
  const participialExtraction = [
    {
      id: "p17", summary: "Модель обнаруживает несостоятельность",
      sourceSpan: { start: 0, end: participialComma, text: participialSource.slice(0, participialComma) },
      subject: "Модель", predicate: "обнаруживает", object: "несостоятельность",
      polarity: "positive", qualifications: [], relations: [], mandatory: true,
    },
    {
      id: "p18", summary: "Модель неизбежно сталкивается с жаждой вечности",
      sourceSpan: { start: participialSecondStart, end: participialSource.length, text: participialSource.slice(participialSecondStart) },
      subject: "Модель", predicate: "неизбежно сталкивается", object: "с жаждой вечности",
      polarity: "positive", qualifications: [], relations: [], mandatory: true,
    },
  ];
  const participialOmissionDismissed = await createStyleTransferRequestPreparer(
    fakeRouter(
      participialExtraction,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p17", "p18"]),
      structureAudit(["p17", "p18"], [{
        kind: "relation-omission",
        propositionIds: ["p17", "p18"],
        evidenceSpan: { start: 0, end: participialSource.length, text: participialSource },
        explanation: "Деепричастный оборот 'неизбежно сталкиваясь с' выражает причину или проявление несостоятельности.",
      }]),
      { decisions: [{ issueIndex: 0, classification: "not-cross-proposition", explanation: "Деепричастный оборот без явного союза является сопутствующим обстоятельством, а не отдельной логической связкой." }] },
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "participial-not-cross-proposition", sourceText: participialSource, donorText: donor });
  assert(
    participialOmissionDismissed.inventory.propositions.length === 2,
    "a bare participial modifier adjudicated as not-cross-proposition must not block preparation",
  );
  names.push("dismiss relation-omission on bare participial modifiers adjudicated as not-cross-proposition");

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

  const combinedAuditRelation = { ...inversionExtraction[0].relations[0], kind: "effect" as const };
  const combinedAuditKey = JSON.stringify(["effect", "p2", "p1", "поэтому"]);
  const combinedAudit = {
    checkedPropositionIds: ["p1", "p2"],
    checkedRelationKeys: [combinedAuditKey],
    issues: [
      {
        kind: "relation-type",
        propositionIds: ["p1", "p2"],
        relationKey: combinedAuditKey,
        evidenceSpan: {
          start: inversionSource.indexOf("поэтому"),
          end: inversionSource.indexOf("поэтому") + "поэтому".length,
          text: "поэтому",
        },
        explanation: "Тип связи определён неверно.",
      },
      {
        kind: "relation-inversion",
        propositionIds: ["p1", "p2"],
        relationKey: combinedAuditKey,
        evidenceSpan: {
          start: inversionSource.indexOf("поэтому"),
          end: inversionSource.indexOf("поэтому") + "поэтому".length,
          text: "поэтому",
        },
        explanation: "Направление связи указано наоборот.",
      },
    ],
  };
  const combinedRelationRepair = await createStyleTransferRequestPreparer(
    fakeRouter(
      [{ ...inversionExtraction[0], relations: [combinedAuditRelation] }, inversionExtraction[1]],
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1", "p2"]),
      combinedAudit,
      { decisions: [{ issueIndex: 0, action: "change-kind", correctedKind: "cause", explanation: "Маркер указывает на причину и следствие." }] },
      { decisions: [{ issueIndex: 1, action: "reverse", explanation: "Дождь является причиной укрытия путников." }] },
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "relation-type-and-inversion", sourceText: inversionSource, donorText: donor });
  assert(
    combinedRelationRepair.inventory.propositions[0].relations.some((relation) =>
      relation.kind === "cause" && relation.from === "p1" && relation.to === "p2" && relation.expression === "поэтому"),
    "a relation must remain addressable after its kind is corrected so its direction can also be repaired",
  );
  names.push("apply relation-type and relation-inversion repairs to the same edge");

  let conflictingSameEdgeRepairsRejected = false;
  try {
    const duplicateRelationTypeAudit = {
      checkedPropositionIds: ["p1", "p2"],
      checkedRelationKeys: [combinedAuditKey],
      issues: [
        { ...combinedAudit.issues[0] },
        { ...combinedAudit.issues[0] },
      ],
    };
    await createStyleTransferRequestPreparer(
      fakeRouter(
        [{ ...inversionExtraction[0], relations: [combinedAuditRelation] }, inversionExtraction[1]],
        { missingPropositions: [], missingRelations: [] },
        interpretationAudit(["p1", "p2"]),
        duplicateRelationTypeAudit,
        {
          decisions: [
            { issueIndex: 0, action: "change-kind", correctedKind: "cause", explanation: "Первое решение." },
            { issueIndex: 1, action: "already-correct", explanation: "Противоречащее второе решение." },
          ],
        },
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "conflicting-same-edge-repairs", sourceText: inversionSource, donorText: donor });
  } catch (error) {
    conflictingSameEdgeRepairsRejected = String(error).includes("invalid, duplicate or unexpected decision");
  }
  assert(
    conflictingSameEdgeRepairsRejected,
    "two contradictory adjudications must not target and mutate the same logical relation",
  );
  names.push("reject conflicting adjudications that target the same logical relation");


  const removedRelationResult = await createStyleTransferRequestPreparer(
    fakeRouter(
      [{ ...inversionExtraction[0], relations: [combinedAuditRelation] }, inversionExtraction[1]],
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1", "p2"]),
      combinedAudit,
      { decisions: [{ issueIndex: 0, action: "remove", explanation: "Это внутренняя конструкция, а не межпропозиционная связь." }] },
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "removed-relation-inversion", sourceText: inversionSource, donorText: donor });
  assert(
    removedRelationResult.inventory.propositions.every((item) => item.relations.length === 0),
    "a relation confirmed for removal must not be reversed or keep a stale inversion finding",
  );
  names.push("discard stale inversion findings when the corresponding relation is confirmed for removal");

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


  const concurrentSource = "Возможно, учитель объяснил правило и привёл пример.";
  const firstSpanEnd = concurrentSource.indexOf(" и привёл");
  const secondSpanStart = concurrentSource.indexOf("привёл");
  const concurrentExtraction = [
    {
      id: "p1", summary: "Учитель объяснил правило",
      sourceSpan: { start: 0, end: firstSpanEnd, text: concurrentSource.slice(0, firstSpanEnd) },
      subject: "учитель", predicate: "объяснил", object: "правило",
      polarity: "positive", qualifications: [], relations: [], mandatory: true,
    },
    {
      id: "p2", summary: "Учитель привёл пример",
      sourceSpan: { start: secondSpanStart, end: concurrentSource.length, text: concurrentSource.slice(secondSpanStart) },
      subject: "учитель", predicate: "привёл", object: "пример",
      polarity: "positive", qualifications: [], relations: [], mandatory: true,
    },
  ];
  const parallelModalityIssue = {
    propositionId: "p1", field: "modality",
    evidenceSpan: { start: concurrentSource.indexOf("Возможно"), end: concurrentSource.indexOf("Возможно") + "Возможно".length, text: "Возможно" },
    explanation: "Проверить сохранение значения возможности.",
  };
  const parallelSharedSubjectIssue = {
    propositionId: "p2", field: "subject",
    evidenceSpan: { start: concurrentSource.indexOf("учитель"), end: concurrentSource.indexOf("учитель") + "учитель".length, text: "учитель" },
    explanation: "Общее подлежащее находится за пределами узкого sourceSpan второй пропозиции.",
  };
  const concurrentOutputs = [
    concurrentExtraction,
    { missingPropositions: [], missingRelations: [] },
    interpretationAudit(["p1", "p2"], [parallelModalityIssue, parallelSharedSubjectIssue]),
    { decisions: [{ issueIndex: 0, classification: "already-preserved", explanation: "Модальность сохранена в смысловом представлении." }] },
    { decisions: [{ issueIndex: 1, classification: "already-grounded-in-sentence", explanation: "Подлежащее синтаксически относится к обоим однородным сказуемым." }] },
    structureAudit(["p1", "p2"]),
  ];
  let concurrentCall = 0;
  let activeAdjudications = 0;
  let maximumConcurrentAdjudications = 0;
  let releaseModality: (() => void) | undefined;
  const sharedStarted = new Promise<void>((resolve) => { releaseModality = resolve; });
  const concurrentRouter = {
    async generate() {
      const index = concurrentCall++;
      const output = concurrentOutputs[Math.min(index, concurrentOutputs.length - 1)];
      if (index !== 3 && index !== 4) {
        return { text: JSON.stringify(output), requestedModel: "test", usedModel: "test", fallbackOccurred: false, attempts: [], warnings: [] };
      }
      activeAdjudications += 1;
      maximumConcurrentAdjudications = Math.max(maximumConcurrentAdjudications, activeAdjudications);
      try {
        if (index === 3) {
          await Promise.race([sharedStarted, new Promise<void>((resolve) => setTimeout(resolve, 40))]);
        } else {
          releaseModality?.();
        }
        return { text: JSON.stringify(output), requestedModel: "test", usedModel: "test", fallbackOccurred: false, attempts: [], warnings: [] };
      } finally {
        activeAdjudications -= 1;
      }
    },
  } as unknown as ModelRouter;
  const concurrentPrepared = await createStyleTransferRequestPreparer(
    concurrentRouter, routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "parallel-interpretation-adjudication", sourceText: concurrentSource, donorText: donor });
  assert(
    maximumConcurrentAdjudications === 2,
    "modality and shared-constituent adjudications must overlap instead of waiting for one another",
  );
  assert(
    concurrentPrepared.inventory.propositions.length === 2,
    "parallel adjudication must preserve the validated proposition inventory",
  );
  names.push("run independent modality and shared-constituent adjudications concurrently");

  // Combined Pass-1 failure (imprecise sourceSpan + non-verbatim relation expression)
  const combinedPass1Source = "Дождь пошёл, поэтому путники укрылись.";
  const combinedPass1Extraction = [
    {
      id: "p1",
      summary: "Дождь пошёл",
      sourceSpan: { start: 0, end: 11, text: "Дождь пошел" },
      subject: "Дождь",
      predicate: "пошёл",
      polarity: "positive",
      qualifications: [],
      relations: [],
      mandatory: true,
    },
    {
      id: "p2",
      summary: "Путники укрылись",
      sourceSpan: {
        start: combinedPass1Source.indexOf("путники"),
        end: combinedPass1Source.length,
        text: "путники укрылись.",
      },
      subject: "путники",
      predicate: "укрылись",
      polarity: "positive",
      qualifications: [],
      relations: [{ kind: "cause", from: "p1", to: "p2", expression: "из-за этого" }],
      mandatory: true,
    },
  ];
  const combinedSpanRepaired = [
    { id: "p1", sourceSpan: { start: 0, end: "Дождь пошёл".length, text: "Дождь пошёл" } },
    {
      id: "p2",
      sourceSpan: {
        start: combinedPass1Source.indexOf("путники"),
        end: combinedPass1Source.length,
        text: "путники укрылись.",
      },
    },
  ];
  const combinedRelationRepaired = [
    { id: "p1", relations: [] },
    { id: "p2", relations: [{ kind: "cause", from: "p1", to: "p2", expression: "поэтому" }] },
  ];
  const combinedPass1Prepared = await createStyleTransferRequestPreparer(
    fakeRouter(
      combinedPass1Extraction,
      combinedSpanRepaired,
      combinedRelationRepaired,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1", "p2"]),
      {
        checkedPropositionIds: ["p1", "p2"],
        checkedRelationKeys: [JSON.stringify(["cause", "p1", "p2", "поэтому"])],
        issues: [],
      },
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "combined-pass1-span-and-relation-repair", sourceText: combinedPass1Source, donorText: donor });
  assert(
    combinedPass1Prepared.inventory.propositions[0].sourceSpan.text === "Дождь пошёл" &&
    combinedPass1Prepared.inventory.propositions[1].relations[0]?.expression === "поэтому" &&
    combinedPass1Prepared.inventory.propositions[0].subject === "Дождь" &&
    combinedPass1Prepared.inventory.propositions[1].predicate === "укрылись",
    "combined Pass-1 span and relation-expression defects must be repaired cleanly without mutating semantic fields",
  );
  names.push("repair combined Pass-1 sourceSpan and non-verbatim relation expression defects");

  // Fail-closed when bounded relation repair returns another fabricated expression
  let combinedFabricatedRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        combinedPass1Extraction,
        combinedSpanRepaired,
        [
          { id: "p1", relations: [] },
          { id: "p2", relations: [{ kind: "cause", from: "p1", to: "p2", expression: "выдуманный союз" }] },
        ],
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "combined-pass1-fabricated-rejected", sourceText: combinedPass1Source, donorText: donor });
  } catch (error) {
    combinedFabricatedRejected = String(error).includes("Semantic extraction failed source-bound validation");
  }
  assert(combinedFabricatedRejected, "fabricated relation expressions surviving bounded repair must fail closed");
  names.push("fail closed when Pass-1 relation repair retains fabricated expression");

  // Unanchored Pass-1 relation expression (present elsewhere in sourceText, outside endpoint sentences)
  const distantExprSource = "Однако утро было тихим. Дождь пошёл, поэтому путники укрылись.";
  const distantExprExtraction = [
    {
      id: "p1",
      summary: "Утро было тихим",
      sourceSpan: { start: 0, end: "Однако утро было тихим.".length, text: "Однако утро было тихим." },
      subject: "утро",
      predicate: "было тихим",
      polarity: "positive",
      qualifications: [],
      relations: [],
      mandatory: true,
    },
    {
      id: "p2",
      summary: "Дождь пошёл",
      sourceSpan: {
        start: distantExprSource.indexOf("Дождь"),
        end: distantExprSource.indexOf(", поэтому"),
        text: "Дождь пошёл",
      },
      subject: "Дождь",
      predicate: "пошёл",
      polarity: "positive",
      qualifications: [],
      relations: [{ kind: "cause", from: "p2", to: "p3", expression: "Однако" }],
      mandatory: true,
    },
    {
      id: "p3",
      summary: "Путники укрылись",
      sourceSpan: {
        start: distantExprSource.indexOf("путники"),
        end: distantExprSource.length,
        text: "путники укрылись.",
      },
      subject: "путники",
      predicate: "укрылись",
      polarity: "positive",
      qualifications: [],
      relations: [],
      mandatory: true,
    },
  ];
  const unanchoredRepaired = await createStyleTransferRequestPreparer(
    fakeRouter(
      distantExprExtraction,
      [
        { id: "p1", relations: [] },
        { id: "p2", relations: [{ kind: "cause", from: "p2", to: "p3", expression: "поэтому" }] },
        { id: "p3", relations: [] },
      ],
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1", "p2", "p3"]),
      {
        checkedPropositionIds: ["p1", "p2", "p3"],
        checkedRelationKeys: [JSON.stringify(["cause", "p2", "p3", "поэтому"])],
        issues: [],
      },
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "unanchored-pass1-expression-repair", sourceText: distantExprSource, donorText: donor });
  assert(
    unanchoredRepaired.inventory.propositions[1].relations[0]?.expression === "поэтому",
    "Pass-1 relation expression anchored to another sentence must be repaired to the endpoint connective",
  );
  names.push("repair Pass-1 relation expressions anchored outside endpoint sentences");

  // Symmetric relation stored on BOTH endpoints must pass structure audit & repair atomically
  const symmetricRelation = { kind: "effect", from: "p2", to: "p1", expression: "поэтому" };
  const symmetricKey = JSON.stringify(["effect", "p2", "p1", "поэтому"]);
  const symmetricExtraction = [
    { ...inversionExtraction[0], relations: [{ ...symmetricRelation }] },
    { ...inversionExtraction[1], relations: [{ ...symmetricRelation }] },
  ];
  const symmetricStructureAudit = {
    checkedPropositionIds: ["p1", "p2"],
    checkedRelationKeys: [symmetricKey],
    issues: [
      {
        kind: "relation-type",
        propositionIds: ["p1", "p2"],
        relationKey: symmetricKey,
        evidenceSpan: {
          start: inversionSource.indexOf("поэтому"),
          end: inversionSource.indexOf("поэтому") + "поэтому".length,
          text: "поэтому",
        },
        explanation: "Тип связи неверен.",
      },
      {
        kind: "relation-inversion",
        propositionIds: ["p1", "p2"],
        relationKey: symmetricKey,
        evidenceSpan: {
          start: inversionSource.indexOf("поэтому"),
          end: inversionSource.indexOf("поэтому") + "поэтому".length,
          text: "поэтому",
        },
        explanation: "Направление перепутано.",
      },
    ],
  };
  const symmetricRepaired = await createStyleTransferRequestPreparer(
    fakeRouter(
      symmetricExtraction,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1", "p2"]),
      symmetricStructureAudit,
      { decisions: [{ issueIndex: 0, action: "change-kind", correctedKind: "cause", explanation: "Это причина." }] },
      { decisions: [{ issueIndex: 1, action: "reverse", explanation: "Дождь — причина." }] },
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "symmetric-relation-atomic-repair", sourceText: inversionSource, donorText: donor });
  assert(
    symmetricRepaired.inventory.propositions[0].relations[0]?.kind === "cause" &&
    symmetricRepaired.inventory.propositions[0].relations[0]?.from === "p1" &&
    symmetricRepaired.inventory.propositions[0].relations[0]?.to === "p2" &&
    symmetricRepaired.inventory.propositions[1].relations[0]?.kind === "cause" &&
    symmetricRepaired.inventory.propositions[1].relations[0]?.from === "p1" &&
    symmetricRepaired.inventory.propositions[1].relations[0]?.to === "p2",
    "symmetric relation copies on both endpoint propositions must both be updated atomically by structure audit repair",
  );
  names.push("support symmetric shared relation keys across endpoint propositions in structure audit repair");

  return { passed: names.length, names };
}

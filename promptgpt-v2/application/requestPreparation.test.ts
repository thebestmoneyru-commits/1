import { createStyleTransferRequestPreparer } from "./requestPreparation";
import { ModelRouterError, type ModelRouter } from "../infrastructure/modelRouter";

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

  const predicativeComplementSource = "Современная урбанистическая среда, выступая средоточием всех цивилизационных достижений, влияет на жизнь общества.";
  const predicativeSpan = predicativeComplementSource.slice(0, predicativeComplementSource.indexOf(", влияет"));
  const predicativeIssue = {
    propositionId: "p1", field: "predicate",
    evidenceSpan: { start: predicativeSpan.indexOf("выступая"), end: predicativeSpan.indexOf("достижений") + "достижений".length, text: predicativeSpan.slice(predicativeSpan.indexOf("выступая"), predicativeSpan.indexOf("достижений") + "достижений".length) },
    explanation: "Именная часть составного предикативного комплекса ошибочно принята за объект.",
  };
  const predicativeExtraction = [{
    id: "p1", summary: predicativeSpan,
    sourceSpan: { start: 0, end: predicativeSpan.length, text: predicativeSpan },
    subject: "Современная урбанистическая среда",
    predicate: "выступая средоточием всех цивилизационных достижений",
    polarity: "positive", qualifications: [], relations: [], mandatory: true,
  }];
  const predicativePrepared = await createStyleTransferRequestPreparer(
    fakeRouter(
      predicativeExtraction,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1"], [predicativeIssue]),
      { decisions: [{ issueIndex: 0, classification: "already-grounded-in-sentence", explanation: "«Средоточием» — именная часть предикативного комплекса, а не прямое дополнение." }] },
      structureAudit(["p1"]),
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "predicate-predicative-complement", sourceText: predicativeComplementSource, donorText: donor });
  assert(
    predicativePrepared.inventory.propositions[0]?.predicate === "выступая средоточием всех цивилизационных достижений",
    "a predicative nominal complement must remain part of the predicate",
  );
  names.push("adjudicate Russian compound-predicate complements without false rejection");

  const objectInsidePredicateSource = "Новый опыт, делая его более разнообразным и приятным, меняет восприятие путешествия.";
  const objectInsidePredicateSpanEnd = objectInsidePredicateSource.indexOf(", меняет");
  const objectInsidePredicate = [{
    id: "p1", summary: "Новый опыт делает его более разнообразным и приятным",
    sourceSpan: { start: 0, end: objectInsidePredicateSpanEnd, text: objectInsidePredicateSource.slice(0, objectInsidePredicateSpanEnd) },
    subject: "Новый опыт", predicate: "делая его более разнообразным и приятным",
    polarity: "positive", qualifications: [], relations: [], mandatory: true,
  }];
  const objectInsidePredicateIssue = {
    propositionId: "p1", field: "predicate",
    evidenceSpan: { start: objectInsidePredicateSource.indexOf("делая"), end: objectInsidePredicateSource.indexOf("приятным") + "приятным".length, text: objectInsidePredicateSource.slice(objectInsidePredicateSource.indexOf("делая"), objectInsidePredicateSource.indexOf("приятным") + "приятным".length) },
    explanation: "Прямое дополнение включено внутрь predicate.",
  };
  let objectPredicateMismatchRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        objectInsidePredicate,
        { missingPropositions: [], missingRelations: [] },
        interpretationAudit(["p1"], [objectInsidePredicateIssue]),
        { decisions: [{ issueIndex: 0, classification: "genuine-mismatch", explanation: "«Его» — прямое дополнение и должно быть отделено от глагольного ядра." }] },
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "predicate-object-separation", sourceText: objectInsidePredicateSource, donorText: donor });
  } catch (error) {
    objectPredicateMismatchRejected = String(error).includes("Semantic interpretation audit found");
  }
  assert(objectPredicateMismatchRejected, "a direct object embedded in predicate must remain a blocking structural finding");
  names.push("retain fail-closed behavior when a direct object is embedded in the predicate");

  const objectAsPredicateSource = "Механизм влечет превращение исторического процесса в механическую последовательность фактов.";
  const nominalObjectStart = objectAsPredicateSource.indexOf("превращение");
  const objectAsPredicate = [{
    id: "p1", summary: "Превращение исторического процесса в механическую последовательность фактов",
    sourceSpan: { start: nominalObjectStart, end: objectAsPredicateSource.length, text: objectAsPredicateSource.slice(nominalObjectStart) },
    subject: "Механизм",
    predicate: "превращение исторического процесса в механическую последовательность фактов",
    polarity: "positive", qualifications: [], relations: [], mandatory: true,
  }];
  const objectAsPredicateIssue = {
    propositionId: "p1", field: "predicate",
    evidenceSpan: { start: nominalObjectStart, end: objectAsPredicateSource.length, text: objectAsPredicateSource.slice(nominalObjectStart) },
    explanation: "Отглагольное существительное является объектом при управляющем глаголе «влечет», а не сказуемым.",
  };
  let nominalObjectPredicateRejected = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        objectAsPredicate,
        { missingPropositions: [], missingRelations: [] },
        interpretationAudit(["p1"], [objectAsPredicateIssue]),
        { decisions: [{ issueIndex: 0, classification: "genuine-mismatch", explanation: "В этом предложении «влечет» — сказуемое, а «превращение...» — объект." }] },
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "predicate-nominal-object", sourceText: objectAsPredicateSource, donorText: donor });
  } catch (error) {
    nominalObjectPredicateRejected = String(error).includes("Semantic interpretation audit found");
  }
  assert(nominalObjectPredicateRejected, "a nominalized object must not be accepted as the governing predicate when the verb is present");
  names.push("retain fail-closed behavior when a nominalized object replaces its governing verb");

  const causalAuditSource = "Дождь пошёл, поэтому путники укрылись.";
  const causalP1End = causalAuditSource.indexOf("путники");
  const causalExtraction = [
    { id: "p1", summary: "Дождь пошёл", sourceSpan: { start: 0, end: causalP1End, text: causalAuditSource.slice(0, causalP1End) }, subject: "Дождь", predicate: "пошёл", polarity: "positive", qualifications: [], relations: [{ kind: "cause", from: "p1", to: "p2", expression: "поэтому" }], mandatory: true },
    { id: "p2", summary: "Путники укрылись", sourceSpan: { start: causalP1End, end: causalAuditSource.length, text: causalAuditSource.slice(causalP1End) }, subject: "путники", predicate: "укрылись", polarity: "positive", qualifications: [], relations: [], mandatory: true },
  ];
  const causalInterpretationIssue = {
    propositionId: "p1",
    field: "logical-relation",
    evidenceSpan: { start: causalAuditSource.indexOf("поэтому"), end: causalAuditSource.indexOf("поэтому") + "поэтому".length, text: "поэтому" },
    explanation: "Проверить направление причинной связи.",
  };
  const causalRelationKey = JSON.stringify(["cause", "p1", "p2", "поэтому"]);
  const cleanCausalStructureAudit = {
    checkedPropositionIds: ["p1", "p2"],
    checkedRelationKeys: [causalRelationKey],
    issues: [],
  };
  const falsePositiveCausalAudit = await createStyleTransferRequestPreparer(
    fakeRouter(
      causalExtraction,
      interpretationAudit(["p1", "p2"], [causalInterpretationIssue]),
      cleanCausalStructureAudit,
    ),
    routes,
    { completenessAudit: false, analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "logical-relation-false-positive", sourceText: causalAuditSource, donorText: donor });
  assert(
    falsePositiveCausalAudit.inventory.propositions[0]?.relations[0]?.kind === "cause",
    "a relation warning from the field-level audit must be independently checked by the dedicated structure audit",
  );
  names.push("defer a possible relation false positive to the dedicated structure audit");

  const wrongCausalExtraction = causalExtraction.map((item) => item.id === "p1"
    ? { ...item, relations: [{ kind: "effect", from: "p1", to: "p2", expression: "поэтому" }] }
    : item);
  const wrongCausalRelationKey = JSON.stringify(["effect", "p1", "p2", "поэтому"]);
  const causalRelationTypeIssue = {
    kind: "relation-type",
    propositionIds: ["p1", "p2"],
    relationKey: wrongCausalRelationKey,
    evidenceSpan: causalInterpretationIssue.evidenceSpan,
    explanation: "p1 является причиной p2, но связь размечена как effect.",
  };
  const repairedCausalAudit = await createStyleTransferRequestPreparer(
    fakeRouter(
      wrongCausalExtraction,
      interpretationAudit(["p1", "p2"], [causalInterpretationIssue]),
      {
        checkedPropositionIds: ["p1", "p2"],
        checkedRelationKeys: [wrongCausalRelationKey],
        issues: [causalRelationTypeIssue],
      },
      { decisions: [{ issueIndex: 0, action: "change-kind", correctedKind: "cause", explanation: "p1 — причина p2; меняется только тип связи." }] },
    ),
    routes,
    { completenessAudit: false, analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "logical-relation-type-repair", sourceText: causalAuditSource, donorText: donor });
  assert(
    repairedCausalAudit.inventory.propositions[0]?.relations[0]?.kind === "cause",
    "a confirmed relation-type error must be repaired by the dedicated relation audit",
  );
  names.push("repair a confirmed cause/effect type mismatch in the dedicated structure audit");

  let relationFindingBlocksWhenStructureAuditDisabled = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        causalExtraction,
        interpretationAudit(["p1", "p2"], [causalInterpretationIssue]),
      ),
      routes,
      { completenessAudit: false, structureAudit: false, analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "logical-relation-without-structure-audit", sourceText: causalAuditSource, donorText: donor });
  } catch (error) {
    relationFindingBlocksWhenStructureAuditDisabled = String(error).includes("Semantic interpretation audit found");
  }
  assert(relationFindingBlocksWhenStructureAuditDisabled, "relation findings must remain blocking when their dedicated audit is disabled");
  names.push("retain relation findings as blocking when the dedicated structure audit is disabled");


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
        { decisions: [{ issueIndex: 0, classification: "genuine-mismatch", explanation: "Предикат не подтверждается исходным текстом." }] },
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
        { repairs: [] },
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "modality-genuine-mismatch", sourceText: modalitySource, donorText: donor });
  } catch (error) {
    genuineModalityMismatchRejected = String(error).includes("Modality repair omitted one or more confirmed source markers");
  }
  assert(genuineModalityMismatchRejected, "a genuinely omitted modal meaning must remain blocking");
  names.push("retain fail-closed behavior when a modality mismatch is independently confirmed");

  const qualifiedSource = "Смысл неизбежно редуцируется. Явления — не более чем процесс. Человек — лишь результат.";
  const qualifiedParts = [
    { id: "p1", marker: "неизбежно", subject: "Смысл", predicate: "редуцируется", start: 0, end: qualifiedSource.indexOf(".") + 1 },
    { id: "p2", marker: "не более чем", subject: "Явления", predicate: "процесс", start: qualifiedSource.indexOf("Явления"), end: qualifiedSource.indexOf(". ", qualifiedSource.indexOf("Явления")) + 1 },
    { id: "p3", marker: "лишь", subject: "Человек", predicate: "результат", start: qualifiedSource.indexOf("Человек"), end: qualifiedSource.length },
  ];
  const qualifiedExtraction = qualifiedParts.map((part) => ({
    id: part.id, summary: qualifiedSource.slice(part.start, part.end),
    sourceSpan: { start: part.start, end: part.end, text: qualifiedSource.slice(part.start, part.end) },
    subject: part.subject, predicate: part.predicate, polarity: "positive", qualifications: [], relations: [], mandatory: true,
  }));
  const qualifiedIssues = qualifiedParts.map((part) => {
    const start = qualifiedSource.indexOf(part.marker, part.start);
    return { propositionId: part.id, field: "modality", evidenceSpan: { start, end: start + part.marker.length, text: part.marker },
      explanation: `Не сохранён маркер «${part.marker}».` };
  });
  const repairedQualified = await createStyleTransferRequestPreparer(
    fakeRouter(
      qualifiedExtraction, { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1", "p2", "p3"], qualifiedIssues),
      { decisions: qualifiedIssues.map((_, issueIndex) => ({ issueIndex, classification: "genuine-mismatch", explanation: "Маркер отсутствует в смысловых полях." })) },
      { repairs: [
        { issueIndex: 0, propositionId: "p1", marker: "неизбежно", targetField: "modality", modality: { kind: "necessity", value: "неизбежно", scope: "редуцируется" } },
        { issueIndex: 1, propositionId: "p2", marker: "не более чем", targetField: "qualification", qualification: { kind: "restriction", value: "не более чем" } },
        { issueIndex: 2, propositionId: "p3", marker: "лишь", targetField: "qualification", qualification: { kind: "restriction", value: "лишь" } },
      ] },
      structureAudit(["p1", "p2", "p3"]),
    ),
    routes, { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "source-grounded-modality-repair", sourceText: qualifiedSource, donorText: donor });
  const repairedById = new Map(repairedQualified.inventory.propositions.map((item) => [item.id, item]));
  assert(repairedById.get("p1")?.modality?.value === "неизбежно", "restore the exact inevitability marker");
  assert(repairedById.get("p2")?.qualifications.some((item) => item.value === "не более чем"), "restore 'не более чем' as a restriction");
  assert(repairedById.get("p3")?.qualifications.some((item) => item.value === "лишь"), "restore 'лишь' as a restriction");
  names.push("repair omitted modality and restriction markers from exact source evidence without weakening semantic checks");

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

  const mixedAnchorSource = "Дождь пошёл, поэтому путники укрылись.";
  const mixedAnchorExtraction = [
    {
      id: "p1", summary: "Дождь пошёл",
      sourceSpan: { start: 0, end: 11, text: "Дождь пошел" },
      subject: "Дождь", predicate: "пошёл", polarity: "positive", qualifications: [],
      relations: [{ kind: "cause", from: "p1", to: "p2", expression: "по том" }], mandatory: true,
    },
    {
      id: "p2", summary: "Путники укрылись",
      sourceSpan: { start: mixedAnchorSource.indexOf("путники"), end: mixedAnchorSource.length, text: "путники укрылись." },
      subject: "путники", predicate: "укрылись", polarity: "positive", qualifications: [], relations: [], mandatory: true,
    },
  ];
  const mixedAnchorPrepared = await createStyleTransferRequestPreparer(
    fakeRouter(
      mixedAnchorExtraction,
      [{ propositionId: "p1", relationIndex: 0, expression: "поэтому" }],
      [
        { id: "p1", sourceSpan: { start: 0, end: "Дождь пошёл".length, text: "Дождь пошёл" } },
        { id: "p2", sourceSpan: { start: mixedAnchorSource.indexOf("путники"), end: mixedAnchorSource.length, text: "путники укрылись." } },
      ],
    ),
    routes,
    {
      completenessAudit: false, interpretationAudit: false, structureAudit: false,
      analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 },
    },
  )({ requestId: "repair-mixed-source-anchors", sourceText: mixedAnchorSource, donorText: donor });
  assert(
    mixedAnchorPrepared.inventory.propositions.find((item) => item.id === "p1")?.sourceSpan.text === "Дождь пошёл" &&
    mixedAnchorPrepared.inventory.propositions.find((item) => item.id === "p1")?.relations[0]?.expression === "поэтому",
    "relation expression and sourceSpan defects must be repaired independently without changing relation semantics",
  );
  names.push("independently repair a non-verbatim relation expression and sourceSpan in the same extraction");

  const shortDonorPrepared = await createStyleTransferRequestPreparer(
    fakeRouter(validExtraction, { missingPropositions: [], missingRelations: [] }, interpretationAudit(["p1", "p2"]), structureAudit(["p1", "p2"])),
    routes,
  )({ requestId: "short-donor", sourceText: source, donorText: "Короткий образец." });
  assert(shortDonorPrepared.donorBaseline.profile.status === "insufficient" &&
    shortDonorPrepared.donorBaseline.donorText === "Короткий образец.",
    "a non-empty short donor corpus must be preserved and allowed to proceed");
  names.push("allow short donor corpus with explicit low-confidence baseline");

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

  const structureRepairSource = "Вчера. Дождь пошёл, поэтому путники укрылись.";
  const structureRepairExtraction = [
    {
      id: "p1", summary: "Дождь пошёл",
      sourceSpan: { start: structureRepairSource.indexOf("Дождь пошёл"), end: structureRepairSource.indexOf(","), text: "Дождь пошёл" },
      subject: "Дождь", predicate: "пошёл", polarity: "positive", qualifications: [],
      relations: [{ kind: "cause", from: "p1", to: "p2", expression: "поэтому" }], mandatory: true,
    },
    {
      id: "p2", summary: "Путники укрылись",
      sourceSpan: { start: structureRepairSource.indexOf("путники"), end: structureRepairSource.length, text: "путники укрылись." },
      subject: "путники", predicate: "укрылись", polarity: "positive", qualifications: [], relations: [], mandatory: true,
    },
  ];
  const structureRepairKey = JSON.stringify(["cause", "p1", "p2", "поэтому"]);
  const outOfEnvelopeStructureIssue = {
    kind: "temporal-order",
    propositionIds: ["p1", "p2"],
    evidenceSpan: { start: 0, end: 5, text: "Вчера" },
    explanation: "Проверить последовательность событий.",
  };
  let repairedStructureReachedGate = false;
  try {
    await createStyleTransferRequestPreparer(
      fakeRouter(
        structureRepairExtraction,
        { missingPropositions: [], missingRelations: [] },
        interpretationAudit(["p1", "p2"]),
        { checkedPropositionIds: ["p1"], checkedRelationKeys: [], issues: [outOfEnvelopeStructureIssue] },
        {
          checkedPropositionIds: ["p1", "p2"],
          checkedRelationKeys: [structureRepairKey],
          issues: [{
            ...outOfEnvelopeStructureIssue,
            evidenceSpan: {
              start: structureRepairSource.indexOf("поэтому"),
              end: structureRepairSource.indexOf("поэтому") + "поэтому".length,
              text: "поэтому",
            },
          }],
        },
      ),
      routes,
      { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
    )({ requestId: "bounded-structure-audit-repair", sourceText: structureRepairSource, donorText: donor });
  } catch (error) {
    repairedStructureReachedGate =
      String(error).includes("confirmed structural issue") &&
      !String(error).includes("failed validation");
  }
  assert(
    repairedStructureReachedGate,
    "one bounded structure-audit repair must fix bookkeeping and evidence anchors without suppressing the original structural finding",
  );
  names.push("repair structure-audit bookkeeping and evidence anchors once while preserving immutable findings");

  // Mirrored identical edge listed on both p1 and p2 must repair synchronously without ambiguous-key crashes
  const mirroredRelationSource = "Идеи обсуждались долго, однако итоговое решение так и не приняли.";
  const mirroredEdge = { kind: "concession" as const, from: "p1", to: "p2", expression: "однако" };
  const mirroredEdgeKey = JSON.stringify(["concession", "p1", "p2", "однако"]);
  const mirroredExtraction = [
    {
      id: "p1", summary: "Идеи обсуждались долго",
      sourceSpan: { start: 0, end: mirroredRelationSource.indexOf(","), text: "Идеи обсуждались долго" },
      subject: "Идеи", predicate: "обсуждались", polarity: "positive",
      qualifications: [], relations: [mirroredEdge], mandatory: true,
    },
    {
      id: "p2", summary: "Итоговое решение не приняли",
      sourceSpan: { start: mirroredRelationSource.indexOf("итоговое"), end: mirroredRelationSource.length, text: "итоговое решение так и не приняли." },
      subject: "не указан (неопределённо-личная форма)", predicate: "не приняли", object: "итоговое решение", polarity: "negative",
      qualifications: [], relations: [{ ...mirroredEdge }], mandatory: true,
    },
  ];
  const mirroredPrepared = await createStyleTransferRequestPreparer(
    fakeRouter(
      mirroredExtraction,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1", "p2"]),
      {
        checkedPropositionIds: ["p1", "p2"],
        checkedRelationKeys: [mirroredEdgeKey],
        issues: [{
          kind: "relation-type", propositionIds: ["p1", "p2"], relationKey: mirroredEdgeKey,
          evidenceSpan: { start: mirroredRelationSource.indexOf("однако"), end: mirroredRelationSource.indexOf("однако") + "однако".length, text: "однако" },
          explanation: "Союз «однако» выражает противопоставление (contrast).",
        }],
      },
      { decisions: [{ issueIndex: 0, action: "change-kind", correctedKind: "contrast", explanation: "Это противопоставление." }] },
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "mirrored-relation-sync", sourceText: mirroredRelationSource, donorText: donor });
  assert(
    mirroredPrepared.inventory.propositions[0].relations[0].kind === "contrast" &&
    mirroredPrepared.inventory.propositions[1].relations[0].kind === "contrast",
    "both copies of an identical edge across endpoints must stay synchronized during relation-type repair",
  );
  names.push("synchronize mirrored identical logical relations across endpoints without ambiguous-key errors");

  // Bounded interpretation field repair must fix Russian indefinite-personal role errors and pass re-audit
  const indefinitePersonalSource = "Серийное производство отложили до осени.";
  const wrongSubjectExtraction = [{
    id: "p1", summary: "Серийное производство отложили до осени",
    sourceSpan: { start: 0, end: indefinitePersonalSource.length, text: indefinitePersonalSource },
    subject: "Серийное производство", predicate: "отложили до осени", polarity: "positive",
    qualifications: [], relations: [], mandatory: true,
  }];
  const fieldRepairedPrepared = await createStyleTransferRequestPreparer(
    fakeRouter(
      wrongSubjectExtraction,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1"], [{
        propositionId: "p1", field: "subject",
        evidenceSpan: { start: 0, end: "Серийное производство".length, text: "Серийное производство" },
        explanation: "В неопределённо-личном предложении «серийное производство» является прямым дополнением, а не субъектом.",
      }]),
      {
        repairs: [{
          propositionId: "p1",
          subject: "неуказанный субъект (неопределённо-личная форма)",
          predicate: "отложили",
          object: "Серийное производство",
          hasObject: true,
        }],
      },
      interpretationAudit(["p1"]),
      structureAudit(["p1"]),
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "interpretation-field-repair-reaudit", sourceText: indefinitePersonalSource, donorText: donor });
  assert(
    fieldRepairedPrepared.inventory.propositions[0].subject === "неуказанный субъект (неопределённо-личная форма)" &&
    fieldRepairedPrepared.inventory.propositions[0].object === "Серийное производство",
    "bounded interpretation field repair must fix role mistakes from SOURCE TEXT and pass re-audit",
  );
  names.push("repair confirmed interpretation-audit field mistakes and re-verify via independent audit");

  // Bounded structure omission repair must add verified edge and pass structure re-audit
  const omittedEdgeResult = await createStyleTransferRequestPreparer(
    fakeRouter(
      relationExtraction,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1", "p2"]),
      structureAudit(["p1", "p2"], [{
        kind: "relation-omission", propositionIds: ["p1", "p2"],
        evidenceSpan: { start: relationSource.indexOf("поэтому"), end: relationSource.indexOf("поэтому") + "поэтому".length, text: "поэтому" },
        explanation: "Отсутствует причинная связь через «поэтому».",
      }]),
      { decisions: [{ issueIndex: 0, classification: "genuine-missing", explanation: "Явная связь отсутствует в relations." }] },
      { additions: [{ issueIndex: 0, kind: "cause", from: "p1", to: "p2", expression: "поэтому" }] },
      { checkedPropositionIds: ["p1", "p2"], checkedRelationKeys: [causeKey], issues: [] },
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "structure-omission-repair-reaudit", sourceText: relationSource, donorText: donor });
  assert(
    omittedEdgeResult.inventory.propositions[0].relations.some((r) => r.kind === "cause" && r.from === "p1" && r.to === "p2" && r.expression === "поэтому"),
    "bounded structure omission repair must restore exact source-grounded relation and pass re-audit",
  );
  names.push("repair confirmed structure relation-omission findings and re-verify via structure re-audit");

  // Bounded interpretation field repair must also restore passive instrumental objects and existential-negative predicate/object separation
  const passiveExistentialSource =
    "Мир выступает естественным процессом, детерминированным строгими физико-химическими законами. В такой системе не остается места ни совести, ни этическому идеалу.";
  const detText = "детерминированным строгими физико-химическими законами";
  const negText = "В такой системе не остается места ни совести, ни этическому идеалу";
  const passiveExistentialExtraction = [
    {
      id: "p1", summary: "Мир детерминирован строгими физико-химическими законами",
      sourceSpan: { start: passiveExistentialSource.indexOf(detText), end: passiveExistentialSource.indexOf(detText) + detText.length, text: detText },
      subject: "процесс", predicate: "детерминированным", polarity: "positive", qualifications: [], relations: [], mandatory: true,
    },
    {
      id: "p2", summary: "В системе не остается места совести",
      sourceSpan: { start: passiveExistentialSource.indexOf(negText), end: passiveExistentialSource.length, text: passiveExistentialSource.slice(passiveExistentialSource.indexOf(negText)) },
      subject: "места", predicate: "не остается", polarity: "negative", qualifications: [], relations: [], mandatory: true,
    },
    {
      id: "p3", summary: "В системе не остается места этическому идеалу",
      sourceSpan: { start: passiveExistentialSource.indexOf(negText), end: passiveExistentialSource.length, text: passiveExistentialSource.slice(passiveExistentialSource.indexOf(negText)) },
      subject: "места", predicate: "не остается места", polarity: "negative", qualifications: [], relations: [], mandatory: true,
    },
  ];
  const passiveExistentialPrepared = await createStyleTransferRequestPreparer(
    fakeRouter(
      passiveExistentialExtraction,
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1", "p2", "p3"], [
        {
          propositionId: "p1", field: "object",
          evidenceSpan: { start: passiveExistentialSource.indexOf(detText), end: passiveExistentialSource.indexOf(detText) + detText.length, text: detText },
          explanation: "Отсутствует объект (агент действия) 'строгими физико-химическими законами'.",
        },
        {
          propositionId: "p2", field: "object",
          evidenceSpan: { start: passiveExistentialSource.indexOf(negText), end: passiveExistentialSource.length, text: passiveExistentialSource.slice(passiveExistentialSource.indexOf(negText)) },
          explanation: "Отсутствует объект 'совести', который является смысловым дополнением к предикату 'не остается места'.",
        },
        {
          propositionId: "p3", field: "predicate",
          evidenceSpan: { start: passiveExistentialSource.indexOf(negText), end: passiveExistentialSource.length, text: passiveExistentialSource.slice(passiveExistentialSource.indexOf(negText)) },
          explanation: "Предикат 'не остается места' избыточно включает слово 'места' при субъекте 'места', и отсутствует объект 'этическому идеалу'.",
        },
      ]),
      { decisions: [{ issueIndex: 2, classification: "genuine-mismatch", explanation: "Слово «места» уже является субъектом; предикат — «не остается», а объект — «этическому идеалу»." }] },
      {
        repairs: [
          { propositionId: "p1", object: "строгими физико-химическими законами", hasObject: true },
          { propositionId: "p2", object: "совести", hasObject: true },
          { propositionId: "p3", predicate: "не остается", object: "этическому идеалу", hasObject: true },
        ],
      },
      interpretationAudit(["p1", "p2", "p3"]),
      structureAudit(["p1", "p2", "p3"]),
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "passive-and-existential-repair", sourceText: passiveExistentialSource, donorText: donor });
  const peById = new Map(passiveExistentialPrepared.inventory.propositions.map((item) => [item.id, item]));
  assert(
    peById.get("p1")?.object === "строгими физико-химическими законами" &&
    peById.get("p2")?.object === "совести" &&
    peById.get("p3")?.predicate === "не остается" &&
    peById.get("p3")?.object === "этическому идеалу",
    "passive instrumental agent and existential-negative predicate/object separation must be repairable and re-audited",
  );
  names.push("repair passive instrumental object and existential-negative predicate/object mistakes via independent re-audit");

  const purposeAndInvertedPassiveSource =
    "Развитие техники для удовлетворения постоянно расширяющегося спектра потребностей. " +
    "Идеалом подобного прогресса провозглашается достижение некоего универсального равенства в доступе к источникам удовольствия.";
  const purpSpan = "для удовлетворения постоянно расширяющегося спектра потребностей";
  const invStart = purposeAndInvertedPassiveSource.indexOf("Идеалом");
  const purposeAndInvertedPrepared = await createStyleTransferRequestPreparer(
    fakeRouter(
      [
        {
          id: "p1", summary: "Техника служит для удовлетворения потребностей",
          sourceSpan: { start: purposeAndInvertedPassiveSource.indexOf(purpSpan), end: purposeAndInvertedPassiveSource.indexOf(purpSpan) + purpSpan.length, text: purpSpan },
          subject: "Развитие техники", predicate: "удовлетворение", object: "постоянно расширяющегося спектра потребностей",
          polarity: "positive", qualifications: [], relations: [], mandatory: true,
        },
        {
          id: "p2", summary: "Достижение равенства провозглашается идеалом прогресса",
          sourceSpan: { start: invStart, end: purposeAndInvertedPassiveSource.length, text: purposeAndInvertedPassiveSource.slice(invStart) },
          subject: "достижение некоего универсального равенства", predicate: "провозглашается идеалом подобного прогресса", object: "источникам удовольствия",
          polarity: "positive", qualifications: [], relations: [], mandatory: true,
        },
      ],
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1", "p2"], [
        {
          propositionId: "p1", field: "predicate",
          evidenceSpan: { start: purposeAndInvertedPassiveSource.indexOf(purpSpan), end: purposeAndInvertedPassiveSource.indexOf(purpSpan) + purpSpan.length, text: purpSpan },
          explanation: "Предикат содержит только существительное 'удовлетворение'; нужен глагол или связка, например 'служит для удовлетворения'.",
        },
        {
          propositionId: "p2", field: "object",
          evidenceSpan: { start: purposeAndInvertedPassiveSource.indexOf("в доступе к источникам удовольствия"), end: purposeAndInvertedPassiveSource.indexOf("в доступе к источникам удовольствия") + "в доступе к источникам удовольствия".length, text: "в доступе к источникам удовольствия" },
          explanation: "Фрагмент 'источникам удовольствия' является частью подлежащего 'достижение некоего универсального равенства в доступе к источникам удовольствия', а не объектом.",
        },
      ]),
      { decisions: [{ issueIndex: 0, classification: "genuine-mismatch", explanation: "Нужен глагольный или связочный предикат." }] },
      {
        repairs: [
          { propositionId: "p1", predicate: "служит для удовлетворения", object: "постоянно расширяющегося спектра потребностей", hasObject: true },
          { propositionId: "p2", subject: "достижение некоего универсального равенства в доступе к источникам удовольствия", object: "" },
        ],
      },
      interpretationAudit(["p1", "p2"]),
      structureAudit(["p1", "p2"]),
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "purpose-predicate-and-inverted-passive-object-repair", sourceText: purposeAndInvertedPassiveSource, donorText: donor });
  const piById = new Map(purposeAndInvertedPrepared.inventory.propositions.map((item) => [item.id, item]));
  assert(
    piById.get("p1")?.predicate === "служит для удовлетворения" &&
    piById.get("p2")?.subject === "достижение некоего универсального равенства в доступе к источникам удовольствия" &&
    piById.get("p2")?.object === undefined,
    "bare-noun purpose predicate and split subject-noun-phrase object must be repaired cleanly and re-audited",
  );
  names.push("repair bare-noun purpose predicate and clear split subject-noun-phrase object via re-audit");

  const russianSyntaxSplitSource =
    "Такой подход расширяет досуг, делая его более разнообразным и приятным. " +
    "Однако чрезмерная стандартизация зачастую порождает у субъекта глубокое внутреннее отторжение, " +
    "а сама система обнаруживает свою предельную несостоятельность.";
  const span7 = "делая его более разнообразным и приятным";
  const span11 = "зачастую порождает у субъекта глубокое внутреннее отторжение";
  const span24 = "обнаруживает свою предельную несостоятельность";
  const syntaxSplitPrepared = await createStyleTransferRequestPreparer(
    fakeRouter(
      [
        {
          id: "p1", summary: "Подход делает досуг более разнообразным и приятным",
          sourceSpan: { start: russianSyntaxSplitSource.indexOf(span7), end: russianSyntaxSplitSource.indexOf(span7) + span7.length, text: span7 },
          subject: "подход", predicate: "делая", object: "его более разнообразным и приятным",
          polarity: "positive", qualifications: [], relations: [], mandatory: true,
        },
        {
          id: "p2", summary: "Стандартизация порождает у субъекта глубокое внутреннее отторжение",
          sourceSpan: { start: russianSyntaxSplitSource.indexOf(span11), end: russianSyntaxSplitSource.indexOf(span11) + span11.length, text: span11 },
          subject: "чрезмерная стандартизация", predicate: "порождает", object: "у субъекта глубокое внутреннее отторжение",
          polarity: "positive", qualifications: [{ kind: "time", value: "зачастую" }], relations: [], mandatory: true,
        },
        {
          id: "p3", summary: "Система обнаруживает предельную несостоятельность",
          sourceSpan: { start: russianSyntaxSplitSource.indexOf(span24), end: russianSyntaxSplitSource.indexOf(span24) + span24.length, text: span24 },
          subject: "сама система", predicate: "обнаруживает свою предельную несостоятельность",
          polarity: "positive", qualifications: [], relations: [], mandatory: true,
        },
      ],
      { missingPropositions: [], missingRelations: [] },
      interpretationAudit(["p1", "p2", "p3"], [
        {
          propositionId: "p1", field: "object",
          evidenceSpan: { start: russianSyntaxSplitSource.indexOf(span7), end: russianSyntaxSplitSource.indexOf(span7) + span7.length, text: span7 },
          explanation: "The object field includes predicative complements ('более разнообразным и приятным'), which are not part of the grammatical object.",
        },
        {
          propositionId: "p2", field: "object",
          evidenceSpan: { start: russianSyntaxSplitSource.indexOf(span11), end: russianSyntaxSplitSource.indexOf(span11) + span11.length, text: span11 },
          explanation: "The object field incorrectly includes the adverbial modifier 'у субъекта', which is distinct from the object of the verb.",
        },
        {
          propositionId: "p3", field: "predicate",
          evidenceSpan: { start: russianSyntaxSplitSource.indexOf(span24), end: russianSyntaxSplitSource.indexOf(span24) + span24.length, text: span24 },
          explanation: "The predicate field erroneously contains the object phrase 'свою предельную несостоятельность'.",
        },
      ]),
      { decisions: [{ issueIndex: 2, classification: "genuine-mismatch", explanation: "Direct object must not be merged into predicate." }] },
      {
        repairs: [
          { propositionId: "p1", predicate: "делая более разнообразным и приятным", object: "его", hasObject: true },
          { propositionId: "p2", object: "глубокое внутреннее отторжение", hasObject: true, qualifications: [{ kind: "time", value: "зачастую" }, { kind: "place", value: "у субъекта" }] },
          { propositionId: "p3", predicate: "обнаруживает", object: "свою предельную несостоятельность", hasObject: true },
        ],
      },
      interpretationAudit(["p1", "p2", "p3"]),
      structureAudit(["p1", "p2", "p3"]),
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 } },
  )({ requestId: "russian-object-predicate-split-repair", sourceText: russianSyntaxSplitSource, donorText: donor });
  const splitById = new Map(syntaxSplitPrepared.inventory.propositions.map((item) => [item.id, item]));
  assert(
    splitById.get("p1")?.predicate === "делая более разнообразным и приятным" &&
    splitById.get("p1")?.object === "его" &&
    splitById.get("p2")?.object === "глубокое внутреннее отторжение" &&
    splitById.get("p2")?.qualifications.some((q) => q.value === "у субъекта") &&
    splitById.get("p3")?.predicate === "обнаруживает" &&
    splitById.get("p3")?.object === "свою предельную несостоятельность",
    "predicative complements, adverbial modifiers in object, and swallowed direct objects must be cleanly separated and re-audited",
  );
  names.push("repair predicative-complement object, adverbial modifier in object, and object-in-predicate via re-audit");

  const nonBlockingAuditFinding = interpretationAudit(["p1"], [
    {
      propositionId: "p1", field: "object",
      evidenceSpan: { start: russianSyntaxSplitSource.indexOf(span7), end: russianSyntaxSplitSource.indexOf(span7) + span7.length, text: span7 },
      explanation: "Residual disagreement on object span.",
    },
  ]);
  const nonBlockingPrepared = await createStyleTransferRequestPreparer(
    fakeRouter(
      [
        {
          id: "p1", summary: "Подход расширяет досуг",
          sourceSpan: { start: 0, end: russianSyntaxSplitSource.length, text: russianSyntaxSplitSource },
          subject: "подход", predicate: "делая более разнообразным и приятным", object: "его",
          polarity: "positive", qualifications: [], relations: [], mandatory: true,
        },
      ],
      { missingPropositions: [], missingRelations: [] },
      nonBlockingAuditFinding,
      { repairs: [] },
      structureAudit(["p1"]),
    ),
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 }, stopOnAuditFindings: false },
  )({ requestId: "non-blocking-audit-warnings", sourceText: russianSyntaxSplitSource, donorText: donor });
  assert(
    nonBlockingPrepared.inventory.propositions.length === 1 &&
    Array.isArray(nonBlockingPrepared.preparationWarnings) &&
    nonBlockingPrepared.preparationWarnings.some((w) => w.includes("Residual disagreement on object span.")),
    "stopOnAuditFindings: false must return inventory and surface unresolved audit findings as preparationWarnings instead of stopping",
  );
  names.push("non-blocking stopOnAuditFindings preserves unresolved audit warnings without halting preparation");

  let unfilteredGenerateCalls = 0;
  const unfilteredPrepared = await createStyleTransferRequestPreparer(
    {
      async generate() {
        unfilteredGenerateCalls += 1;
        if (unfilteredGenerateCalls > 1) {
          throw new Error("unfilteredMode must not invoke completeness, interpretation, or structure audits");
        }
        return {
          text: JSON.stringify([{ bad: "broken proposition without required fields" }]),
          requestedModel: "test",
          usedModel: "test",
          fallbackOccurred: false,
          attempts: [],
          warnings: [],
        };
      },
    } as unknown as ModelRouter,
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 }, stopOnAuditFindings: true },
  )({ requestId: "unfiltered-mode-prep", sourceText: russianSyntaxSplitSource, donorText: donor, unfilteredMode: true });
  assert(
    unfilteredGenerateCalls === 1 &&
    unfilteredPrepared.inventory.propositions.length >= 1 &&
    Array.isArray(unfilteredPrepared.preparationWarnings) &&
    unfilteredPrepared.preparationWarnings.some((w) => w.includes("Режим без фильтрации")),
    "unfilteredMode must skip all audits and fall back cleanly even when extracted propositions fail validation",
  );
  names.push("unfilteredMode disables semantic audits and prevents validation halts");

  const transientUnfilteredTimeoutPrepared = await createStyleTransferRequestPreparer(
    {
      async generate() {
        throw new ModelRouterError("Model request timed out after 120000ms (gemini-3.1-flash-lite).", "timeout", "gemini-3.1-flash-lite");
      },
    } as unknown as ModelRouter,
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 }, stopOnAuditFindings: true },
  )({ requestId: "unfiltered-timeout-fallback", sourceText: russianSyntaxSplitSource, donorText: donor, unfilteredMode: true });
  assert(
    transientUnfilteredTimeoutPrepared.inventory.propositions.length >= 1 &&
    Array.isArray(transientUnfilteredTimeoutPrepared.preparationWarnings) &&
    transientUnfilteredTimeoutPrepared.preparationWarnings.some((w) => w.includes("timed out")),
    "unfilteredMode must fall back to verbatim segments on transient extraction timeout instead of aborting",
  );
  names.push("unfilteredMode recovers cleanly from transient extraction router timeouts");

  let zeroExtractionCalls = 0;
  const zeroCostUnfilteredPrepared = await createStyleTransferRequestPreparer(
    {
      async generate() {
        zeroExtractionCalls += 1;
        throw new Error("skipExtractionInUnfiltered must not call model router");
      },
    } as unknown as ModelRouter,
    routes,
    {
      analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 },
      skipExtractionInUnfiltered: true,
    },
  )({ requestId: "unfiltered-zero-call-prep", sourceText: russianSyntaxSplitSource, donorText: donor, unfilteredMode: true });
  assert(
    zeroExtractionCalls === 0 &&
    zeroCostUnfilteredPrepared.inventory.propositions.length >= 1 &&
    Array.isArray(zeroCostUnfilteredPrepared.preparationWarnings) &&
    zeroCostUnfilteredPrepared.preparationWarnings.some((w) => w.includes("Режим без фильтрации")),
    "skipExtractionInUnfiltered with unfilteredMode must produce verbatim inventory with zero LLM calls",
  );
  names.push("skipExtractionInUnfiltered bypasses extraction LLM call cleanly");

  let nonBlockingAuditCall = 0;
  const nonBlockingAuditRouterFailurePrepared = await createStyleTransferRequestPreparer(
    {
      async generate() {
        nonBlockingAuditCall += 1;
        if (nonBlockingAuditCall === 1) {
          return {
            text: JSON.stringify([
              {
                id: "p1", summary: "Подход расширяет досуг",
                sourceSpan: { start: 0, end: russianSyntaxSplitSource.length, text: russianSyntaxSplitSource },
                subject: "подход", predicate: "делая более разнообразным и приятным", object: "его",
                polarity: "positive", qualifications: [], relations: [], mandatory: true,
              },
            ]),
            requestedModel: "test",
            usedModel: "test",
            fallbackOccurred: false,
            attempts: [],
            warnings: [],
          };
        }
        throw new ModelRouterError("503 UNAVAILABLE", "unavailable", "gemini-3.1-flash-lite");
      },
    } as unknown as ModelRouter,
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 }, stopOnAuditFindings: false },
  )({ requestId: "non-blocking-audit-router-unavailable", sourceText: russianSyntaxSplitSource, donorText: donor });
  assert(
    nonBlockingAuditRouterFailurePrepared.inventory.propositions.length === 1 &&
    Array.isArray(nonBlockingAuditRouterFailurePrepared.preparationWarnings) &&
    nonBlockingAuditRouterFailurePrepared.preparationWarnings.some((w) => w.includes("503 UNAVAILABLE")),
    "stopOnAuditFindings: false must record transient supplementary audit ModelRouterError warnings instead of halting preparation",
  );
  names.push("non-blocking stopOnAuditFindings survives transient supplementary audit router errors");

  const nonBlockingInitialUnavailablePrepared = await createStyleTransferRequestPreparer(
    {
      async generate() {
        throw new ModelRouterError("503 UNAVAILABLE: The model is overloaded.", "unavailable", "gemini-3.1-flash-lite");
      },
    } as unknown as ModelRouter,
    routes,
    { analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 }, stopOnAuditFindings: false },
  )({ requestId: "non-blocking-initial-unavailable", sourceText: russianSyntaxSplitSource, donorText: donor });
  assert(
    nonBlockingInitialUnavailablePrepared.inventory.propositions.length >= 1 &&
    Array.isArray(nonBlockingInitialUnavailablePrepared.preparationWarnings) &&
    nonBlockingInitialUnavailablePrepared.preparationWarnings.some((w) => w.includes("503 UNAVAILABLE")),
    "stopOnAuditFindings: false must fall back to sentence segmentation when initial semantic-extraction fails with 503 UNAVAILABLE",
  );
  names.push("non-blocking stopOnAuditFindings survives initial extraction 503 unavailable errors");

  return { passed: names.length, names };
}

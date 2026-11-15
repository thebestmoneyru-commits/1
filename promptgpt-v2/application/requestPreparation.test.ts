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
const donor = Array.from({ length: 40 }, (_, i) =>
  `В тот день святой отец пришёл в храм, где собралось множество людей. Он говорил с ними долго и внимательно, наставляя каждого на путь добра.`
).join("\n\n");

export async function runRequestPreparationSelfTests(): Promise<{ passed: number; names: string[] }> {
  const names: string[] = [];
  const routes = { semanticExtraction: { preferredModel: "extractor" } };
  const prepare = createStyleTransferRequestPreparer(fakeRouter(validExtraction, { missingPropositions: [] }), routes, {
    analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 },
  });
  const result = await prepare({ requestId: "test", sourceText: source, donorText: donor });
  assert(result.inventory.propositions.length === 2, "validated propositions must enter the source-bound inventory");
  assert(result.inventory.sourceLength === source.length, "inventory must bind to exact source length");
  assert(result.donorBaseline.profile.status === "sufficient", "sufficient donor sample must produce a frozen baseline");
  names.push("build source-bound inventory and donor baseline");

  const omitted = {
    id: "p3", summary: "Он основал обитель", sourceSpan: { start: 0, end: 25, text: source.slice(0, 25) },
    subject: "Он", predicate: "основал", object: "обитель", polarity: "positive",
    qualifications: [], relations: [], mandatory: true,
  };
  const audited = await createStyleTransferRequestPreparer(
    fakeRouter(validExtraction, { missingPropositions: [omitted] }), routes,
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
    await createStyleTransferRequestPreparer(fakeRouter(validExtraction, { missingPropositions: [invalidAuditSpan] }), routes, {
      analyzer: { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 },
    })({ requestId: "bad-audit-span", sourceText: source, donorText: donor });
  } catch (error) { invalidAuditSpanRejected = String(error).includes("Semantic completeness audit failed source-bound validation"); }
  assert(invalidAuditSpanRejected, "audit omissions must be tied to exact source spans");
  names.push("reject audit omissions without exact source evidence");

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
    await createStyleTransferRequestPreparer(fakeRouter(validExtraction, { missingPropositions: [] }), routes)({
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

  return { passed: names.length, names };
}

import { shouldAcceptAntiCopyRewrite } from "./routerAdapters";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Router adapter self-test failed: ${message}`);
}

export function runRouterAdapterSelfTests(): { passed: number; names: string[] } {
  const names: string[] = [];
  assert(
    shouldAcceptAntiCopyRewrite({
      sourceOverlap: 0.9,
      rewrittenOverlap: 0.62,
      sourceLength: 2400,
      rewrittenLength: 2300,
    }),
    "accept a sufficiently long rewrite with a substantial reduction below the absolute overlap ceiling",
  );
  names.push("accept substantial anti-copy improvement");

  assert(
    !shouldAcceptAntiCopyRewrite({
      sourceOverlap: 0.9,
      rewrittenOverlap: 0.88,
      sourceLength: 2400,
      rewrittenLength: 2300,
    }),
    "reject a cosmetic overlap reduction",
  );
  names.push("reject cosmetic anti-copy improvement");

  assert(
    !shouldAcceptAntiCopyRewrite({
      sourceOverlap: 0.9,
      rewrittenOverlap: 0.6,
      sourceLength: 2400,
      rewrittenLength: 1600,
    }),
    "reject a short rewrite that may have summarized away source content",
  );
  names.push("preserve source-scale output length");

  assert(
    !shouldAcceptAntiCopyRewrite({
      sourceOverlap: 0.9,
      rewrittenOverlap: 0.72,
      sourceLength: 2400,
      rewrittenLength: 2300,
    }),
    "reject a rewrite that remains above the maximum allowed trigram overlap",
  );
  names.push("enforce absolute anti-copy ceiling");

  return { passed: names.length, names };
}

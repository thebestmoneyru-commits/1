export function computeWordTrigramOverlap(sourceText: string, candidateText: string): number {
  if (typeof sourceText !== "string" || typeof candidateText !== "string") return 0;
  const wordsOf = (value: string) =>
    value
      .toLocaleLowerCase("ru-RU")
      .replace(/ё/gu, "е")
      .match(/[\p{L}\p{N}-]+/gu) ?? [];
  const sourceWords = wordsOf(sourceText);
  const candidateWords = wordsOf(candidateText);
  if (sourceWords.length < 3 || candidateWords.length < 3) return 0;
  const trigrams = (words: string[]) => {
    const set = new Set<string>();
    for (let i = 0; i <= words.length - 3; i++) {
      set.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    }
    return set;
  };
  const srcSet = trigrams(sourceWords);
  if (srcSet.size === 0) return 0;
  const candSet = trigrams(candidateWords);
  let shared = 0;
  for (const gram of candSet) {
    if (srcSet.has(gram)) shared += 1;
  }
  return shared / Math.max(1, Math.min(srcSet.size, candSet.size));
}

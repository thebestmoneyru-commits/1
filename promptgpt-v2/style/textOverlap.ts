const RUSSIAN_FUNCTION_WORDS = new Set([
  "а","без","более","бы","был","была","были","было","быть","в","вам","вас","ведь","весь","во",
  "вот","все","всего","всей","всем","всеми","всему","всех","вы","да","даже","для","до","его",
  "ее","её","если","есть","же","за","здесь","и","из","или","им","ими","их","к","как","ко",
  "когда","который","которая","которые","которое","которых","кто","ли","либо","мне","много",
  "мы","на","над","надо","нам","нас","не","него","нее","неё","нет","ни","них","но","ну","о",
  "об","однако","он","она","они","оно","от","перед","по","под","при","про","с","сам","сама",
  "само","сами","свой","своего","своей","свои","своих","свою","себе","себя","так","также",
  "там","те","тебя","тем","то","того","тоже","той","только","том","ты","у","уже","чего",
  "чей","чем","что","чтобы","эта","эти","это","этого","этой","этом","эту","я",
]);

function wordsOf(value: string): string[] {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/gu, "е")
    .match(/[\p{L}\p{N}-]+/gu) ?? [];
}

function contentTrigrams(words: string[]): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i <= words.length - 3; i++) {
    const gram = words.slice(i, i + 3);
    // Ignore generic grammatical scaffolding; retain phrases carrying at least
    // two meaningful lexical units so topic words/common syntax are not misread as copying.
    if (gram.filter((word) => !RUSSIAN_FUNCTION_WORDS.has(word)).length >= 2) {
      result.add(gram.join(" "));
    }
  }
  return result;
}

/**
 * Measures copied content-bearing word sequences, not unavoidable function-word
 * scaffolding. The denominator is the candidate's eligible unique trigrams:
 * a copied passage is still detected, while ordinary Russian syntax is not.
 */
export function computeWordTrigramOverlap(sourceText: string, candidateText: string): number {
  if (typeof sourceText !== "string" || typeof candidateText !== "string") return 0;
  const sourceTrigrams = contentTrigrams(wordsOf(sourceText));
  const candidateTrigrams = contentTrigrams(wordsOf(candidateText));
  if (sourceTrigrams.size === 0 || candidateTrigrams.size === 0) return 0;
  let shared = 0;
  for (const gram of candidateTrigrams) {
    if (sourceTrigrams.has(gram)) shared += 1;
  }
  return shared / candidateTrigrams.size;
}

/**
 * Is this string PROSE rather than an expression?
 *
 * The cards that typeset a single line (practice_card's problem,
 * common_mistake's two lines) accept either maths or a sentence, and the
 * equation typesetter is the wrong tool for a sentence: it sets every word as
 * italic variables juxtaposed by implicit multiplication.
 *
 * The test is words, not symbols: two or more runs of four+ letters that are
 * not function names mean a sentence.
 */
const FUNCTION_WORDS = ['sqrt', 'frac', 'sin', 'cos', 'tan', 'log', 'exp', 'abs', 'theta'];

export const looksLikeProse = (s: string): boolean => {
  const words = (s.match(/[A-Za-z]{4,}/g) ?? []).filter(
    (w) => !FUNCTION_WORDS.includes(w.toLowerCase())
  );
  return words.length >= 2;
};

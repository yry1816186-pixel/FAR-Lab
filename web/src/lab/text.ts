/**
 * Word-boundary ellipsis — a title cut mid-word ("…increas") reads as broken,
 * not shortened. Shared by the home queue rows, the map switcher and the rail
 * so every surface truncates the same way (design-baseline W6: one strategy).
 * Latin text ALWAYS breaks at the last space (rail review 2026-09-02 caught
 * "supplementatio…"); CJK has no spaces, so the char cut is the boundary.
 */
export const ellipsize = (text: string, max: number): string => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const hasCjk = /[　-鿿＀-￯]/.test(cut);
  return `${(lastSpace > (hasCjk ? max * 0.6 : 0) ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

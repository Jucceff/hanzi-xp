// Segmentación por máxima coincidencia hacia delante usando un diccionario de palabras.
// Suficiente para textos graduados construidos con vocabulario HSK.

export interface Token {
  text: string;
  /** true si el token es una palabra del diccionario */
  known: boolean;
}

const HAN = /\p{Script=Han}/u;

export function isHan(ch: string): boolean {
  return HAN.test(ch);
}

export function segment(text: string, dict: Set<string>, maxLen = 5): Token[] {
  const out: Token[] = [];
  const chars = [...text];
  let i = 0;
  while (i < chars.length) {
    if (!isHan(chars[i])) {
      let j = i;
      while (j < chars.length && !isHan(chars[j])) j++;
      out.push({ text: chars.slice(i, j).join(''), known: false });
      i = j;
      continue;
    }
    let len = Math.min(maxLen, chars.length - i);
    for (; len > 1; len--) {
      if (dict.has(chars.slice(i, i + len).join(''))) break;
    }
    const t = chars.slice(i, i + len).join('');
    out.push({ text: t, known: dict.has(t) });
    i += len;
  }
  return out;
}

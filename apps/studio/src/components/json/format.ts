// Work with original tokens: JSON.parse validates, but its rounded values and
// collapsed duplicate properties are never used for display or persistence.
export function jsonTokens(text: string) {
  if (new TextEncoder().encode(text).length > 1024 * 1024) throw new RangeError('Display too long');
  JSON.parse(text);
  return text.match(/"(?:[^"\\]|\\.)*"|[{}\[\],:]|[^\s{}\[\],:]+/g) ?? [];
}
export function compactJson(text: string) {
  return jsonTokens(text).join('');
}
export function storageJson(text: string) {
  try {
    return compactJson(text);
  } catch {
    return text;
  }
}
export function displayJson(text: string) {
  try {
    return formatJson(text);
  } catch {
    return text;
  }
}
export function formatJson(text: string) {
  const tokens = jsonTokens(text);
  let depth = 0;
  let result = '';
  const line = () => '\n' + '    '.repeat(Math.min(depth, 128));
  for (const [index, token] of tokens.entries()) {
    const previous = tokens[index - 1];
    const next = tokens[index + 1];
    if (token === ']' || token === '}') {
      depth--;
      if (previous !== '[' && previous !== '{') result += line();
    }
    result += token;
    if (token === '[' || token === '{') {
      depth++;
      if (next !== ']' && next !== '}') result += line();
    }
    if (token === ',') result += line();
    if (token === ':') result += ' ';
    if (result.length > 1024 * 1024) throw new RangeError('Display too long');
  }
  return result + '\n';
}

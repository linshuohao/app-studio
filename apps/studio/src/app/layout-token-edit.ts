import { parseJson, type JsonNode } from '../components/json/model';

// Token spans keep neighbouring authored keys, strings, numbers and whitespace intact.
export function removeLayoutMember(raw: string, member: JsonNode) {
  const { tokens } = parseJson(raw);
  let first = member.keyIndex ?? member.start;
  let end = member.end;
  if (tokens[end] === ',') end++;
  else if (tokens[first - 1] === ',') first--;
  let cursor = 0,
    from = 0;
  for (let i = 0; i < end; i++) {
    const start = raw.indexOf(tokens[i]!, cursor);
    if (i === first) from = start;
    cursor = start + tokens[i]!.length;
  }
  return raw.slice(0, from) + raw.slice(cursor);
}

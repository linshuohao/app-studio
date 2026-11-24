/** Canonical decimal coefficient/exponent, including Number's exponent display. */
function decimalKey(text: string) {
  const [mantissa = '', exponent = '0'] = text.toLowerCase().split('e');
  const negative = mantissa.startsWith('-');
  const unsigned = mantissa.replace(/^[+-]/, '');
  const [integer = '', fraction = ''] = unsigned.split('.');
  let digits = (integer + fraction).replace(/^0+/, '');
  let power = Number(exponent) - fraction.length;
  if (!digits) return '0';
  while (digits.endsWith('0')) {
    digits = digits.slice(0, -1);
    power++;
  }
  return `${negative ? '-' : ''}${digits}:${power}`;
}
export function parseNumber(text: string): number | string | null {
  if (text === '') return null;
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return text;
  const value = Number(text);
  if (
    !Number.isFinite(value) ||
    !Number.isSafeInteger(Math.trunc(value)) ||
    decimalKey(text) !== decimalKey(String(value))
  )
    return text;
  return value;
}
export function displayInput(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : String(value);
  return '';
}

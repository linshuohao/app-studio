export const escapePointer = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1');
export const at = (pointer: string, key: string | number) =>
  `${pointer}/${escapePointer(String(key))}`;

/** Shared acceptance vectors; production UI and domain parsers remain independent. */
export const gregorianDates = [
  ['0001-01-01', true],
  ['9999-12-31', true],
  ['2028-02-29', true],
  ['1900-02-29', false],
  ['2000-02-29', true],
  ['0000-01-01', false],
  ['2028-04-31', false],
  ['2028-2-29', false],
  ['2028-02-29\n', false],
  [' 2028-02-29', false],
] as const;

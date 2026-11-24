import type { ValidatorInput, ValidatorIssue, ValidatorTask } from '@form-engine/runtime';

export const travelPassportValidator = 'travel.checkPassportDuplicates';

export function checkPassportDuplicates({ read }: ValidatorInput): ValidatorTask {
  const insureds = read({ source: 'data', path: '/insureds' });
  const paths = ['/applicant/passportNumber'];

  // The first insured card represents the applicant and uses the same source field.
  if (insureds.kind === 'value' && Array.isArray(insureds.value)) {
    for (let index = 1; index < insureds.value.length; index++) {
      paths.push(`/insureds/${index}/passportNumber`);
    }
  }

  const byNumber = new Map<string, string[]>();
  for (const path of paths) {
    const passport = read({ source: 'data', path });
    if (passport.kind !== 'value' || typeof passport.value !== 'string') continue;
    const number = passport.value.trim().toUpperCase();
    if (!number) continue;
    const group = byNumber.get(number);
    if (group) group.push(path);
    else byNumber.set(number, [path]);
  }

  const issues: ValidatorIssue[] = [];
  for (const group of byNumber.values()) {
    if (group.length < 2) continue;
    for (const path of group) {
      issues.push({
        code: 'DUPLICATE_PASSPORT_NUMBER',
        message: '护照号码与另一位被保人重复。',
        target: { source: 'data', path },
      });
    }
  }
  return { result: Promise.resolve(issues) };
}

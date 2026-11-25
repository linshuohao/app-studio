const identityFields = [
  'name',
  'surname',
  'givenName',
  'birthDate',
  'passportNumber',
  'passportExpiry',
] as const;

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function identity(person: Readonly<Record<string, unknown>>) {
  const normalized: Record<string, string> = {};
  for (const key of identityFields) {
    const value = person[key];
    if (typeof value !== 'string' || !value.trim()) return;
    normalized[key] =
      key === 'surname' || key === 'givenName' || key === 'passportNumber'
        ? value.trim().toUpperCase()
        : value.trim();
  }
  return normalized;
}

export function projectUnderwritingSubmission(snapshot: unknown) {
  const form = record(snapshot);
  const applicant = record(form?.applicant);
  if (!applicant || !Array.isArray(form?.insureds)) return;
  const self = record(form.insureds[0]);
  const person = identity(applicant);
  if (!person || !self || self.relationship !== 'self' || typeof applicant.email !== 'string')
    return;
  const insureds = [{ ...self, ...person }];
  for (const input of form.insureds.slice(1)) {
    const family = record(input);
    const fields = family && identity(family);
    if (!family || !fields) return;
    insureds.push({ ...family, ...fields });
  }
  return {
    ...form,
    applicant: { ...applicant, ...person, email: applicant.email.trim() },
    insureds,
  };
}

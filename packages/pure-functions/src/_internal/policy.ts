import type { JsonValue } from '@form-engine/protocol';
export type AgePolicy = { minAge: number; maxAge: number; adultAge: number };
export type DailyRates = { adultDailyMinor: number; childDailyMinor: number };
export type RatePolicy = {
  agePolicy: AgePolicy;
  maxDays: number;
  maxInsureds: number;
  rates: { basic: DailyRates; plus: DailyRates };
};
export function arity(args: readonly JsonValue[], count: number) {
  if (args.length !== count) throw Error(`function: expected ${count} arguments`);
}
function object(value: JsonValue | undefined, keys: string[]): Record<string, JsonValue> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw Error('function: invalid policy structure');
  return value;
}
export function safeInteger(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}
export function positiveLimit(value: JsonValue | undefined): number {
  if (!safeInteger(value, 1)) throw Error('function: positive safe integer limit required');
  return value;
}
export function readAgePolicy(value: JsonValue | undefined): AgePolicy {
  const p = object(value, ['minAge', 'maxAge', 'adultAge']);
  if (
    !safeInteger(p.minAge) ||
    !safeInteger(p.maxAge) ||
    !safeInteger(p.adultAge) ||
    p.minAge > p.maxAge
  )
    throw Error('function: invalid age policy');
  // The adult threshold is independent of the covered age interval (all-adult/all-child policies are possible).
  return { minAge: p.minAge, maxAge: p.maxAge, adultAge: p.adultAge };
}
export function eligible(age: JsonValue | undefined, policy: AgePolicy): age is number {
  return safeInteger(age) && age >= policy.minAge && age <= policy.maxAge;
}
export function readRatePolicy(value: JsonValue | undefined): RatePolicy {
  const p = object(value, ['agePolicy', 'maxDays', 'maxInsureds', 'rates']);
  const rates = object(p.rates, ['basic', 'plus']);
  const readRate = (value: JsonValue | undefined): DailyRates => {
    const r = object(value, ['adultDailyMinor', 'childDailyMinor']);
    if (!safeInteger(r.adultDailyMinor) || !safeInteger(r.childDailyMinor))
      throw Error('function: nonnegative safe integer rates required');
    return { adultDailyMinor: r.adultDailyMinor, childDailyMinor: r.childDailyMinor };
  };
  return {
    agePolicy: readAgePolicy(p.agePolicy),
    maxDays: positiveLimit(p.maxDays),
    maxInsureds: positiveLimit(p.maxInsureds),
    rates: { basic: readRate(rates.basic), plus: readRate(rates.plus) },
  };
}
export function checkedAmount(value: number): number {
  if (!safeInteger(value)) throw Error('function: amount overflow');
  return value;
}
export function personPremium(
  age: JsonValue | undefined,
  plan: JsonValue | undefined,
  days: JsonValue | undefined,
  policy: RatePolicy,
): number | null {
  if (
    !eligible(age, policy.agePolicy) ||
    (plan !== 'basic' && plan !== 'plus') ||
    !safeInteger(days, 1) ||
    days > policy.maxDays
  )
    return null;
  const rate = policy.rates[plan];
  return checkedAmount(
    days * (age < policy.agePolicy.adultAge ? rate.childDailyMinor : rate.adultDailyMinor),
  );
}

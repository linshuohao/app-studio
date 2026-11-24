import type { AgePolicy, RatePolicy } from '@form-engine/pure-functions';
// Synthetic acceptance policy, not a real insurance product or quote.
export const agePolicy: AgePolicy = { minAge: 0, maxAge: 80, adultAge: 18 };
export const ratePolicy: RatePolicy = {
  agePolicy,
  maxDays: 30,
  maxInsureds: 5,
  rates: {
    basic: { adultDailyMinor: 100, childDailyMinor: 150 },
    plus: { adultDailyMinor: 180, childDailyMinor: 250 },
  },
};
export const goldenData = () => ({
  applicant: { name: '投保人示例', phone: 'TEST-PHONE' },
  travel: {
    countryCode: 'CN',
    city: { id: 'CN:HZ', label: '杭州市' },
    startDate: '2028-02-28',
    endDate: '2028-02-29',
  },
  plan: 'basic',
  insureds: [
    { name: '成人 A', age: 30, idNumber: 'TEST-A', guardianName: '' },
    { name: '儿童 B', age: 12, idNumber: 'TEST-B', guardianName: '监护人示例' },
  ],
  acknowledged: true,
  estimatedTotalMinor: null,
});
export const blankData = () => ({
  applicant: { name: '', phone: '' },
  travel: { countryCode: 'CN', city: null, startDate: null, endDate: null },
  plan: 'basic',
  insureds: [{ name: '', age: null, idNumber: '', guardianName: '' }],
  acknowledged: false,
  estimatedTotalMinor: null,
});

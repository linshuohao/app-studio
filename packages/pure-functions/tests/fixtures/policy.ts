export const agePolicy = { minAge: 0, maxAge: 80, adultAge: 18 };
export const ratePolicy = {
  agePolicy,
  maxDays: 30,
  maxInsureds: 5,
  rates: {
    basic: { adultDailyMinor: 100, childDailyMinor: 150 },
    plus: { adultDailyMinor: 180, childDailyMinor: 250 },
  },
};

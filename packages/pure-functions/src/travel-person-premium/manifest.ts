import type { PureFunctionManifest } from '@form-engine/protocol/capability';
export const manifest = {
  id: 'travel.personPremium',
  version: '0.1.0',
  parameters: [
    {
      name: 'age',
      schema: true,
    },
    {
      name: 'plan',
      schema: true,
    },
    {
      name: 'days',
      schema: true,
    },
    {
      name: 'ratePolicy',
      schema: {
        type: 'object',
        required: ['agePolicy', 'maxDays', 'maxInsureds', 'rates'],
        properties: {
          agePolicy: {
            type: 'object',
            required: ['minAge', 'maxAge', 'adultAge'],
            properties: {
              minAge: {
                type: 'integer',
                minimum: 0,
                maximum: 9007199254740991,
              },
              maxAge: {
                type: 'integer',
                minimum: 0,
                maximum: 9007199254740991,
              },
              adultAge: {
                type: 'integer',
                minimum: 0,
                maximum: 9007199254740991,
              },
            },
            additionalProperties: false,
          },
          maxDays: {
            type: 'integer',
            minimum: 1,
            maximum: 9007199254740991,
          },
          maxInsureds: {
            type: 'integer',
            minimum: 1,
            maximum: 9007199254740991,
          },
          rates: {
            type: 'object',
            required: ['basic', 'plus'],
            properties: {
              basic: {
                type: 'object',
                required: ['adultDailyMinor', 'childDailyMinor'],
                properties: {
                  adultDailyMinor: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 9007199254740991,
                  },
                  childDailyMinor: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 9007199254740991,
                  },
                },
                additionalProperties: false,
              },
              plus: {
                type: 'object',
                required: ['adultDailyMinor', 'childDailyMinor'],
                properties: {
                  adultDailyMinor: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 9007199254740991,
                  },
                  childDailyMinor: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 9007199254740991,
                  },
                },
                additionalProperties: false,
              },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    },
  ],
  returns: {
    type: ['integer', 'null'],
    minimum: 0,
    maximum: 9007199254740991,
  },
} satisfies PureFunctionManifest;

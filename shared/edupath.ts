export const FX_RATES = {
  USD: 1,
  EUR: 0.92,
  AED: 3.67,
  GBP: 0.79,
} as const;

export type SupportedCurrency = keyof typeof FX_RATES;

export function calculateAnnualCost(tuition: number, living: number, extras: number) {
  return tuition + living + extras;
}

export function convertCurrency(amountUsd: number, currency: SupportedCurrency) {
  return Math.round(amountUsd * FX_RATES[currency]);
}

export function monthlyCost(annualCost: number) {
  return Math.round(annualCost / 12);
}

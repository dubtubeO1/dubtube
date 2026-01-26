import Stripe from 'stripe';
import { loadStripe } from '@stripe/stripe-js';

// Server-side Stripe instance
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil',
});

// Client-side Stripe instance
export const getStripe = () => {
  return loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY!);
};

// Stripe Product IDs from environment variables (source of truth)
export const STRIPE_PRODUCT_IDS = {
  MONTHLY: process.env.STRIPE_PRODUCT_MONTHLY!,
  QUARTERLY: process.env.STRIPE_PRODUCT_QUARTERLY!,
  ANNUAL: process.env.STRIPE_PRODUCT_ANNUAL!,
} as const;

// Stripe Price IDs from environment variables (source of truth)
export const STRIPE_PRICE_IDS = {
  MONTHLY: process.env.STRIPE_PRICE_MONTHLY!,
  QUARTERLY: process.env.STRIPE_PRICE_QUARTERLY!,
  ANNUAL: process.env.STRIPE_PRICE_ANNUAL!,
} as const;

// Plan configurations
export const PLAN_CONFIGS = {
  monthly: {
    name: 'Monthly',
    period: 'month',
    priceId: STRIPE_PRICE_IDS.MONTHLY,
  },
  quarterly: {
    name: '3 Months',
    period: '3 months',
    priceId: STRIPE_PRICE_IDS.QUARTERLY,
  },
  annual: {
    name: '12 Months',
    period: '12 months',
    priceId: STRIPE_PRICE_IDS.ANNUAL,
  },
} as const;

export type PlanType = keyof typeof PLAN_CONFIGS;

// Validate that all Product IDs are configured
if (!STRIPE_PRODUCT_IDS.MONTHLY || !STRIPE_PRODUCT_IDS.QUARTERLY || !STRIPE_PRODUCT_IDS.ANNUAL) {
  throw new Error('Missing required Stripe Product ID environment variables');
}

// Validate that all Price IDs are configured
if (!STRIPE_PRICE_IDS.MONTHLY || !STRIPE_PRICE_IDS.QUARTERLY || !STRIPE_PRICE_IDS.ANNUAL) {
  throw new Error('Missing required Stripe Price ID environment variables');
}

import Stripe from 'stripe';
import { loadStripe } from '@stripe/stripe-js';

// Server-side Stripe instance — env var read lazily inside routes (never at module load)
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil',
});

// Client-side Stripe instance
export const getStripe = () => {
  return loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY!);
};

// ─── Product IDs ──────────────────────────────────────────────────────────────
// Read via functions to avoid module-level throws (Next.js evaluates route
// modules at build time; env vars are runtime-only on Railway).

export function getStripeProductIds() {
  return {
    STARTER: process.env.STRIPE_PRODUCT_STARTER ?? '',
    PRO: process.env.STRIPE_PRODUCT_PRO ?? '',
    BUSINESS: process.env.STRIPE_PRODUCT_BUSINESS ?? '',
  } as const;
}

// ─── Plan configurations (9 plans = 3 tiers × 3 intervals) ───────────────────

export const PLAN_CONFIGS = {
  starter_monthly: {
    name: 'Starter',
    tier: 'starter' as const,
    interval: 'monthly' as const,
    billingPeriod: 'month',
    get priceId() { return process.env.STRIPE_PRICE_STARTER_MONTHLY ?? ''; },
    get productId() { return process.env.STRIPE_PRODUCT_STARTER ?? ''; },
    displayPrice: 19.99,
  },
  starter_quarterly: {
    name: 'Starter',
    tier: 'starter' as const,
    interval: 'quarterly' as const,
    billingPeriod: '3 months',
    get priceId() { return process.env.STRIPE_PRICE_STARTER_QUARTERLY ?? ''; },
    get productId() { return process.env.STRIPE_PRODUCT_STARTER ?? ''; },
    displayPrice: 49.99,
  },
  starter_annual: {
    name: 'Starter',
    tier: 'starter' as const,
    interval: 'annual' as const,
    billingPeriod: 'year',
    get priceId() { return process.env.STRIPE_PRICE_STARTER_ANNUAL ?? ''; },
    get productId() { return process.env.STRIPE_PRODUCT_STARTER ?? ''; },
    displayPrice: 159.99,
  },
  pro_monthly: {
    name: 'Pro',
    tier: 'pro' as const,
    interval: 'monthly' as const,
    billingPeriod: 'month',
    get priceId() { return process.env.STRIPE_PRICE_PRO_MONTHLY ?? ''; },
    get productId() { return process.env.STRIPE_PRODUCT_PRO ?? ''; },
    displayPrice: 49.99,
  },
  pro_quarterly: {
    name: 'Pro',
    tier: 'pro' as const,
    interval: 'quarterly' as const,
    billingPeriod: '3 months',
    get priceId() { return process.env.STRIPE_PRICE_PRO_QUARTERLY ?? ''; },
    get productId() { return process.env.STRIPE_PRODUCT_PRO ?? ''; },
    displayPrice: 119.99,
  },
  pro_annual: {
    name: 'Pro',
    tier: 'pro' as const,
    interval: 'annual' as const,
    billingPeriod: 'year',
    get priceId() { return process.env.STRIPE_PRICE_PRO_ANNUAL ?? ''; },
    get productId() { return process.env.STRIPE_PRODUCT_PRO ?? ''; },
    displayPrice: 399.99,
  },
  business_monthly: {
    name: 'Business',
    tier: 'business' as const,
    interval: 'monthly' as const,
    billingPeriod: 'month',
    get priceId() { return process.env.STRIPE_PRICE_BUSINESS_MONTHLY ?? ''; },
    get productId() { return process.env.STRIPE_PRODUCT_BUSINESS ?? ''; },
    displayPrice: 89.99,
  },
  business_quarterly: {
    name: 'Business',
    tier: 'business' as const,
    interval: 'quarterly' as const,
    billingPeriod: '3 months',
    get priceId() { return process.env.STRIPE_PRICE_BUSINESS_QUARTERLY ?? ''; },
    get productId() { return process.env.STRIPE_PRODUCT_BUSINESS ?? ''; },
    displayPrice: 199.99,
  },
  business_annual: {
    name: 'Business',
    tier: 'business' as const,
    interval: 'annual' as const,
    billingPeriod: 'year',
    get priceId() { return process.env.STRIPE_PRICE_BUSINESS_ANNUAL ?? ''; },
    get productId() { return process.env.STRIPE_PRODUCT_BUSINESS ?? ''; },
    displayPrice: 899.99,
  },
} as const;

export type PlanType = keyof typeof PLAN_CONFIGS;
export type PlanTier = 'starter' | 'pro' | 'business';
export type BillingInterval = 'monthly' | 'quarterly' | 'annual';

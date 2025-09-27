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

// Product and price mappings
export const STRIPE_PRODUCTS = {
  MONTHLY: 'prod_T8HGzUNkvt6lrP',
  QUARTERLY: 'prod_T8HI41vqugy9hK',
  ANNUAL: 'prod_T8HKpgcXiwukHd',
} as const;

export const STRIPE_PAYMENT_LINKS = {
  MONTHLY: 'https://buy.stripe.com/test_cNibJ12X17XI9OaeMo8IU02',
  QUARTERLY: 'https://buy.stripe.com/test_28E28r7dh5PAe4qfQs8IU01',
  ANNUAL: 'https://buy.stripe.com/test_5kQ6oH1SXa5QaSe5bO8IU00',
} as const;

// Plan configurations
export const PLAN_CONFIGS = {
  monthly: {
    name: 'Monthly',
    price: 14.99,
    period: 'month',
    productId: STRIPE_PRODUCTS.MONTHLY,
    paymentLink: STRIPE_PAYMENT_LINKS.MONTHLY,
  },
  quarterly: {
    name: '3 Months',
    price: 39.99,
    period: '3 months',
    productId: STRIPE_PRODUCTS.QUARTERLY,
    paymentLink: STRIPE_PAYMENT_LINKS.QUARTERLY,
  },
  annual: {
    name: '12 Months',
    price: 119.99,
    period: '12 months',
    productId: STRIPE_PRODUCTS.ANNUAL,
    paymentLink: STRIPE_PAYMENT_LINKS.ANNUAL,
  },
} as const;

export type PlanType = keyof typeof PLAN_CONFIGS;

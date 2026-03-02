// Plan tier limits for the v2 dubbing feature.

export type PlanTier = 'starter' | 'pro' | 'business'

export interface PlanLimits {
  maxFileSizeBytes: number
  maxMonthlyProjects: number // Use Infinity for unlimited
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  starter: {
    maxFileSizeBytes: 1 * 1024 * 1024 * 1024, // 1 GB
    maxMonthlyProjects: 3,
  },
  pro: {
    maxFileSizeBytes: 3 * 1024 * 1024 * 1024, // 3 GB
    maxMonthlyProjects: 10,
  },
  business: {
    maxFileSizeBytes: 10 * 1024 * 1024 * 1024, // 10 GB
    maxMonthlyProjects: Infinity,
  },
}

/**
 * Resolve the plan tier from subscription data.
 *
 * Checks stripe_product_id against env vars first (authoritative), then falls
 * back to plan_name string for older or manually-set rows.
 * Env vars are read inside the function to avoid module-level evaluation
 * at build time (Next.js evaluates route modules before Railway injects vars).
 */
export function resolvePlanTier(
  planName: string | null,
  stripeProductId: string | null,
): PlanTier {
  // Primary: map by Stripe product_id
  if (stripeProductId) {
    if (stripeProductId === process.env.STRIPE_PRODUCT_STARTER) return 'starter'
    if (stripeProductId === process.env.STRIPE_PRODUCT_PRO) return 'pro'
    if (stripeProductId === process.env.STRIPE_PRODUCT_BUSINESS) return 'business'
  }

  // Fallback: plan_name string (set by webhook from new products)
  if (planName === 'starter') return 'starter'
  if (planName === 'pro') return 'pro'
  if (planName === 'business') return 'business'

  // Default: any active subscription without tier data falls back to pro
  return 'pro'
}

export function getPlanLimits(tier: PlanTier): PlanLimits {
  return PLAN_LIMITS[tier]
}

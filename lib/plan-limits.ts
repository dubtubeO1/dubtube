// Plan tier limits for the v2 dubbing feature.
// TODO Milestone 6: Update resolvePlanTier() when new Stripe products
// (Starter / Pro / Business) are created and their product IDs are known.

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
 * Current v1 plan_name values are billing periods ('monthly', 'quarterly', 'annual'),
 * not tiers. Until Milestone 6 restructures Stripe plans into Starter / Pro / Business,
 * any active subscription defaults to 'pro'.
 */
export function resolvePlanTier(
  _planName: string | null,
  _stripeProductId: string | null,
): PlanTier {
  // TODO Milestone 6: map new stripe_product_id values to correct tiers
  return 'pro'
}

export function getPlanLimits(tier: PlanTier): PlanLimits {
  return PLAN_LIMITS[tier]
}

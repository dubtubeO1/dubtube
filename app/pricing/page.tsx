'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useUser, SignInButton } from '@clerk/nextjs';
import { getStripe } from '@/lib/stripe-client';

// ─── Plan data ────────────────────────────────────────────────────────────────

type BillingInterval = 'monthly' | 'quarterly' | 'annual';

interface TierPricing {
  monthly: number;
  quarterly: number;
  annual: number;
}

interface Tier {
  key: 'starter' | 'pro' | 'business';
  name: string;
  tagline: string;
  pricing: TierPricing;
  features: string[];
  highlight: boolean;
}

const TIERS: Tier[] = [
  {
    key: 'starter',
    name: 'Starter',
    tagline: 'Perfect for getting started',
    pricing: { monthly: 19.99, quarterly: 49.99, annual: 159.99 },
    features: [
      '3 projects / month',
      'Up to 1 GB per video',
      'All languages',
      'Voice cloning',
      'Standard support',
    ],
    highlight: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    tagline: 'For active creators',
    pricing: { monthly: 49.99, quarterly: 119.99, annual: 399.99 },
    features: [
      '10 projects / month',
      'Up to 3 GB per video',
      'All languages',
      'Voice cloning',
      'Priority support',
    ],
    highlight: true,
  },
  {
    key: 'business',
    name: 'Business',
    tagline: 'For high-volume production',
    pricing: { monthly: 89.99, quarterly: 199.99, annual: 899.99 },
    features: [
      'Unlimited projects',
      'Up to 10 GB per video',
      'All languages',
      'Voice cloning',
      'Priority processing',
    ],
    highlight: false,
  },
];

const INTERVAL_LABELS: Record<BillingInterval, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
};

const INTERVAL_PERIOD: Record<BillingInterval, string> = {
  monthly: 'month',
  quarterly: '3 months',
  annual: 'year',
};

// Savings vs monthly (annualised)
const INTERVAL_SAVINGS: Record<BillingInterval, string | null> = {
  monthly: null,
  quarterly: 'Save ~17%',
  annual: 'Save ~33%',
};

const faqs = [
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. You can cancel at any time. Your access continues until the end of the billing period.',
  },
  {
    q: 'What happens to my projects if I cancel?',
    a: 'Your projects are retained for 90 days after your subscription ends. You will receive warning emails before any files are deleted.',
  },
  {
    q: 'What payment methods are accepted?',
    a: 'All major credit and debit cards. Additional payment options will be added soon.',
  },
  {
    q: 'Can I upgrade or downgrade my plan?',
    a: 'Yes. You can switch plans at any time from your billing portal.',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface SubscriptionInfo {
  is_active: boolean;
  stripe_customer_id: string | null;
}

export default function PricingPage() {
  const { user, isLoaded } = useUser();
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [loading, setLoading] = useState<string | null>(null);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !user) {
      setSubscriptionInfo(null);
      return;
    }
    void fetch('/api/me/subscription')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => setSubscriptionInfo(data as SubscriptionInfo | null))
      .catch(() => undefined);
  }, [user, isLoaded]);

  const handleManageSubscription = async () => {
    if (!subscriptionInfo?.stripe_customer_id) return;
    try {
      setPortalLoading(true);
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userData: { stripe_customer_id: subscriptionInfo.stripe_customer_id } }),
      });
      const data = await res.json() as { url?: string };
      if (data.url) window.location.href = data.url;
    } catch {
      // ignore
    } finally {
      setPortalLoading(false);
    }
  };

  const handleCheckout = async (tier: string) => {
    if (!user) return;
    const planType = `${tier}_${interval}`;
    setCheckoutError(null);
    setLoading(planType);
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planType }),
      });
      const data = await response.json() as { sessionId?: string; error?: string; redirectToPortal?: boolean };

      if (!response.ok) {
        if (data.redirectToPortal) {
          await handleManageSubscription();
          return;
        }
        setCheckoutError(data.error ?? 'Checkout failed. Please try again.');
        return;
      }

      if (data.sessionId) {
        const stripe = await getStripe();
        if (stripe) {
          await stripe.redirectToCheckout({ sessionId: data.sessionId });
        } else {
          setCheckoutError('Payment provider could not be loaded. Please try again.');
        }
      }
    } catch {
      setCheckoutError('Something went wrong. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 relative overflow-hidden">
      {/* Floating blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-gradient-to-r from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-500 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 dark:from-slate-200 dark:via-slate-300 dark:to-slate-400 bg-clip-text text-transparent animate-gradient">
            Pricing
          </h1>
          <p className="text-xl md:text-2xl font-light text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
            Choose the plan that fits your workflow. Upgrade or cancel anytime.
          </p>
        </div>

        {/* Billing interval toggle */}
        <div className="flex items-center justify-center gap-1 mb-12">
          <div className="inline-flex rounded-2xl bg-slate-100 dark:bg-slate-800 p-1 gap-1">
            {(['monthly', 'quarterly', 'annual'] as BillingInterval[]).map((iv) => (
              <button
                key={iv}
                onClick={() => setInterval(iv)}
                className={`relative px-5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  interval === iv
                    ? 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {INTERVAL_LABELS[iv]}
                {INTERVAL_SAVINGS[iv] && (
                  <span className="ml-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                    {INTERVAL_SAVINGS[iv]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {checkoutError && (
          <div className="mb-8 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-6 py-4 text-red-700 dark:text-red-300 text-center text-sm">
            {checkoutError}
          </div>
        )}

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {TIERS.map((tier) => {
            const price = tier.pricing[interval];
            const period = INTERVAL_PERIOD[interval];
            const planType = `${tier.key}_${interval}`;
            const isLoadingThis = loading === planType;

            return (
              <div
                key={tier.key}
                className={`relative flex flex-col rounded-3xl shadow-xl p-8 transition-all duration-300 hover:scale-[1.02] ${
                  tier.highlight
                    ? 'bg-gradient-to-br from-slate-700 to-slate-600 dark:from-slate-600 dark:to-slate-500 text-white border-2 border-slate-500'
                    : 'bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {tier.highlight && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-emerald-500 text-white px-4 py-1 rounded-full text-xs font-semibold">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-2xl font-bold mb-1">{tier.name}</h3>
                  <p className={`text-sm ${tier.highlight ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
                    {tier.tagline}
                  </p>
                </div>

                <div className="mb-8">
                  <span className="text-5xl font-extrabold">${price}</span>
                  <span className={`text-base ml-1 ${tier.highlight ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
                    / {period}
                  </span>
                </div>

                <ul className="flex-1 space-y-3 mb-8">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <Check
                        className={`w-4 h-4 flex-shrink-0 ${tier.highlight ? 'text-emerald-400' : 'text-emerald-500'}`}
                      />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA button */}
                {!user ? (
                  <SignInButton mode="modal">
                    <button
                      className={`w-full py-3.5 rounded-2xl font-semibold text-sm transition-all duration-200 ${
                        tier.highlight
                          ? 'bg-white text-slate-700 hover:bg-slate-50'
                          : 'bg-slate-700 text-white hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500'
                      } shadow-md hover:shadow-lg`}
                    >
                      Get started
                    </button>
                  </SignInButton>
                ) : subscriptionInfo?.is_active ? (
                  <button
                    disabled
                    className="w-full py-3.5 rounded-2xl font-semibold text-sm bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                  >
                    Already subscribed
                  </button>
                ) : (
                  <button
                    onClick={() => void handleCheckout(tier.key)}
                    disabled={isLoadingThis}
                    className={`w-full py-3.5 rounded-2xl font-semibold text-sm transition-all duration-200 ${
                      tier.highlight
                        ? 'bg-white text-slate-700 hover:bg-slate-50'
                        : 'bg-slate-700 text-white hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500'
                    } shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isLoadingThis ? 'Processing...' : 'Get started'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Manage subscription */}
        {user && subscriptionInfo?.is_active && (
          <div className="mb-16 text-center">
            <button
              onClick={() => void handleManageSubscription()}
              disabled={portalLoading}
              className="inline-flex items-center px-8 py-3.5 rounded-2xl font-semibold text-sm bg-slate-700 text-white hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {portalLoading ? 'Opening billing portal...' : 'Manage subscription'}
            </button>
          </div>
        )}

        {/* Feature comparison table */}
        <div className="mb-16">
          <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-3xl p-8 border border-slate-200 dark:border-slate-700 shadow-xl">
            <h2 className="text-2xl font-bold text-slate-700 dark:text-slate-200 mb-6 text-center">
              Plan comparison
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-600">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600 dark:text-slate-300">Feature</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-600 dark:text-slate-300">Starter</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-600 dark:text-slate-300">Pro</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-600 dark:text-slate-300">Business</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {[
                    { label: 'Projects / month', starter: '3', pro: '10', business: 'Unlimited' },
                    { label: 'Max file size', starter: '1 GB', pro: '3 GB', business: '10 GB' },
                    { label: 'All languages', starter: true, pro: true, business: true },
                    { label: 'Voice cloning', starter: true, pro: true, business: true },
                    { label: 'Priority processing', starter: false, pro: false, business: true },
                  ].map((row) => (
                    <tr key={row.label} className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">{row.label}</td>
                      {(['starter', 'pro', 'business'] as const).map((t) => {
                        const val = row[t];
                        return (
                          <td key={t} className="px-4 py-3 text-center text-sm text-slate-600 dark:text-slate-300">
                            {typeof val === 'boolean' ? (
                              val ? (
                                <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                              ) : (
                                <span className="text-slate-300 dark:text-slate-600">—</span>
                              )
                            ) : (
                              val
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 dark:from-slate-200 dark:via-slate-300 dark:to-slate-400 bg-clip-text text-transparent mb-10">
            Frequently asked questions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {faqs.map((faq) => (
              <div
                key={faq.q}
                className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-md"
              >
                <h3 className="font-semibold text-base mb-2 text-slate-700 dark:text-slate-200">{faq.q}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

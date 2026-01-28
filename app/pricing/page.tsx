'use client';

import React, { useEffect, useState } from 'react';
import { Check, Star, Zap, Globe, Headphones } from 'lucide-react';
import { useUser, SignInButton } from '@clerk/nextjs';
import { getStripe } from '@/lib/stripe-client';

const plans = [
  {
    name: 'Free',
    price: '0',
    period: 'month',
    features: [
      '1 video/day (no auth)',
      '3 videos/day (with auth)',
      'Max 5 min/video',
      'Ads before playback',
      'Basic support',
    ],
    button: 'Coming Soon',
    highlight: false,
    icon: Globe,
    disabled: true,
    comingSoon: true,
    planType: null,
  },
  {
    name: 'Monthly',
    price: '14.99',
    period: 'month',
    features: [
      'Unlimited videos',
      'Unlimited duration',
      'No ads',
      'Priority support',
      'Premium voice quality',
    ],
    button: 'Subscribe',
    highlight: false,
    icon: Star,
    planType: 'monthly',
  },
  {
    name: '3 Months',
    price: '39.99',
    period: '3 months',
    features: [
      'Unlimited videos',
      'Unlimited duration',
      'No ads',
      'Priority support',
      'Premium voice quality',
    ],
    button: 'Buy 3 Months',
    highlight: true,
    icon: Zap,
    planType: 'quarterly',
  },
  {
    name: '12 Months',
    price: '119.99',
    period: '12 months',
    features: [
      'Unlimited videos',
      'Unlimited duration',
      'No ads',
      'Priority support',
      'Premium voice quality',
    ],
    button: 'Buy 12 Months',
    highlight: false,
    icon: Headphones,
    planType: 'annual',
  },
];

const features = [
  { label: 'Videos per day', free: '1 (no auth) / 3 (auth)', paid: 'Unlimited' },
  { label: 'Max video duration', free: '5 min', paid: 'Unlimited' },
  { label: 'Ads', free: 'Yes', paid: 'No' },
  { label: 'Support', free: 'Basic', paid: 'Priority' },
  { label: 'Voiceover quality', free: 'Standard', paid: 'Premium' },
];

const faqs = [
  {
    q: 'Can I cancel anytime?',
    a: 'Yes, you can cancel your subscription at any time. Your access will remain until the end of your billing period.'
  },
  {
    q: 'What payment methods are accepted?',
    a: 'We accept all major credit cards. More payment options will be added soon.'
  },
  {
    q: 'Is there a refund policy?',
    a: 'If you are not satisfied, contact us within 7 days of purchase for a full refund.'
  },
  {
    q: 'Can I upgrade or downgrade my plan?',
    a: 'Yes, you can change your plan at any time from your account dashboard.'
  },
];

export default function PricingPage() {
  const { user, isLoaded } = useUser();
  const [loading, setLoading] = useState<string | null>(null);
  const [subscriptionInfo, setSubscriptionInfo] = useState<any>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  // Fetch current subscription status for the logged-in user
  useEffect(() => {
    const fetchSubscription = async () => {
      if (!user) {
        setSubscriptionInfo(null);
        return;
      }

      try {
        const res = await fetch('/api/me/subscription');
        if (!res.ok) {
          console.error('Failed to fetch subscription info');
          return;
        }
        const data = await res.json();
        setSubscriptionInfo(data);
      } catch (err) {
        console.error('Error fetching subscription info:', err);
      }
    };

    if (isLoaded) {
      fetchSubscription();
    }
  }, [user, isLoaded]);

  const handleManageSubscription = async () => {
    if (!user || !subscriptionInfo?.stripe_customer_id) {
      console.error('No active subscription or Stripe customer ID to manage');
      return;
    }

    try {
      setPortalLoading(true);
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userData: { stripe_customer_id: subscriptionInfo.stripe_customer_id },
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.url) {
        console.error('Error creating portal session:', data?.error || 'Unknown error');
        return;
      }

      window.location.href = data.url;
    } catch (error) {
      console.error('Error redirecting to billing portal:', error);
    } finally {
      setPortalLoading(false);
    }
  };

  const handleCheckout = async (planType: string) => {
    if (!user) return;
    
    setLoading(planType);
    
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planType }),
      });

      const data = await response.json();

      // Backend guard may block checkout if user already has an active subscription
      if (!response.ok) {
        if (data?.redirectToPortal) {
          console.log('Checkout blocked: user already has active subscription, redirecting to portal');
          await handleManageSubscription();
          return;
        }

        console.error('Error from checkout API:', data?.error || 'Unknown error');
        return;
      }

      const { sessionId } = data;
      
      if (sessionId) {
        const stripe = await getStripe();
        if (stripe) {
          await stripe.redirectToCheckout({ sessionId });
        }
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 relative overflow-hidden">
      {/* Floating background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-gradient-to-r from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-500 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto p-4 py-12">
        {/* Header */}
        <div className="text-center space-y-6 mb-16">
          <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 dark:from-slate-200 dark:via-slate-300 dark:to-slate-400 bg-clip-text text-transparent animate-gradient">
            Pricing
          </h1>
          <p className="text-2xl md:text-3xl font-light text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
            Choose the plan that fits your needs. Upgrade anytime.
          </p>
        </div>

        {/* Comparison Table */}
        <div className="mb-16">
          <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-3xl p-8 border border-slate-200 dark:border-slate-700 shadow-xl">
            <h2 className="text-2xl font-bold text-slate-700 dark:text-slate-200 mb-6 text-center">Feature Comparison</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-600">
                    <th className="px-6 py-4 text-left text-lg font-medium text-slate-700 dark:text-slate-200">Feature</th>
                    <th className="px-6 py-4 text-center text-lg font-medium text-slate-700 dark:text-slate-200">Free</th>
                    <th className="px-6 py-4 text-center text-lg font-medium text-slate-700 dark:text-slate-200">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-600">
                  {features.map((f) => (
                    <tr key={f.label} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-300">
                      <td className="px-6 py-4 font-medium text-slate-700 dark:text-slate-200">{f.label}</td>
                      <td className="px-6 py-4 text-center text-slate-600 dark:text-slate-300">{f.free}</td>
                      <td className="px-6 py-4 text-center text-slate-600 dark:text-slate-300">{f.paid}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Pricing Cards Section Anchor */}
        <div id="pricing-cards" className="scroll-mt-24"></div>
        
        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          {plans.map((plan) => {
            const IconComponent = plan.icon;
            return (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-3xl shadow-xl p-8 transition-all duration-500 transform ${
                  plan.disabled 
                    ? 'opacity-60 cursor-not-allowed' 
                    : 'hover:scale-105'
                } ${
                  plan.highlight 
                    ? 'bg-gradient-to-br from-slate-700 to-slate-600 dark:from-slate-600 dark:to-slate-500 text-white border-2 border-slate-600 dark:border-slate-500' 
                    : 'bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-green-500 text-white px-4 py-1 rounded-full text-sm font-medium">Most Popular</span>
                  </div>
                )}
                {plan.comingSoon && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-orange-500 text-white px-4 py-1 rounded-full text-sm font-medium">Coming Soon</span>
                  </div>
                )}
                
                <div className="text-center mb-6">
                  <div className="flex justify-center mb-4">
                    <div className={`p-3 rounded-2xl ${plan.highlight ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'}`}>
                      <IconComponent className={`w-8 h-8 ${plan.highlight ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`} />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <div className="mb-4">
                    <span className="text-4xl font-extrabold">{plan.price === '0' ? 'Free' : `$${plan.price}`}</span>
                    {plan.price !== '0' && <span className="text-lg opacity-80"> / {plan.period}</span>}
                  </div>
                </div>
                
                <ul className="flex-1 space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <Check className={`w-5 h-5 flex-shrink-0 ${plan.highlight ? 'text-green-400' : 'text-green-500'}`} />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                {plan.disabled ? (
                  <button
                    className="w-full py-4 rounded-2xl font-semibold transition-all duration-300 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-not-allowed opacity-60"
                    disabled
                  >
                    {plan.button}
                  </button>
                ) : !user ? (
                  <SignInButton mode="modal">
                    <button className="w-full py-4 rounded-2xl font-semibold transition-all duration-300 bg-gradient-to-r from-slate-700 to-slate-600 dark:from-slate-600 dark:to-slate-500 text-white hover:from-slate-800 hover:to-slate-700 dark:hover:from-slate-500 dark:hover:to-slate-400 shadow-lg hover:shadow-xl transform hover:scale-105">
                      {plan.button}
                    </button>
                  </SignInButton>
                ) : subscriptionInfo?.is_active && plan.planType ? (
                  // User already has an active subscription – do not show Buy buttons
                  <button
                    className="w-full py-4 rounded-2xl font-semibold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-not-allowed opacity-70"
                    disabled
                  >
                    Already subscribed
                  </button>
                ) : (
                  <button
                    onClick={() => plan.planType && handleCheckout(plan.planType)}
                    disabled={loading === plan.planType}
                    className={`w-full py-4 rounded-2xl font-semibold transition-all duration-300 ${
                      plan.highlight 
                        ? 'bg-white text-slate-700 hover:bg-slate-50 shadow-lg hover:shadow-xl transform hover:scale-105' 
                        : 'bg-gradient-to-r from-slate-700 to-slate-600 dark:from-slate-600 dark:to-slate-500 text-white hover:from-slate-800 hover:to-slate-700 dark:hover:from-slate-500 dark:hover:to-slate-400 shadow-lg hover:shadow-xl transform hover:scale-105'
                    } ${loading === plan.planType ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {loading === plan.planType ? 'Processing...' : plan.button}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Single Manage Subscription button when user has an active subscription */}
        {user && subscriptionInfo?.is_active && (
          <div className="mb-16 text-center">
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className={`inline-flex items-center px-8 py-4 rounded-2xl font-semibold transition-all duration-300 bg-gradient-to-r from-slate-700 to-slate-600 dark:from-slate-600 dark:to-slate-500 text-white hover:from-slate-800 hover:to-slate-700 dark:hover:from-slate-500 dark:hover:to-slate-400 shadow-lg hover:shadow-xl transform hover:scale-105 ${
                portalLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {portalLoading ? 'Opening billing portal...' : 'Manage subscription'}
            </button>
          </div>
        )}

        {/* FAQ Section */}
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 dark:from-slate-200 dark:via-slate-300 dark:to-slate-400 bg-clip-text text-transparent">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {faqs.map((faq, idx) => (
              <div key={idx} className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-lg hover:shadow-xl transition-all duration-300">
                <h3 className="font-semibold text-lg mb-3 text-slate-700 dark:text-slate-200">{faq.q}</h3>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 
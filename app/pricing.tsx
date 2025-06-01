import React from 'react';

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
    button: 'Get Started',
    highlight: false,
  },
  {
    name: 'Monthly',
    price: '29.99',
    period: 'month',
    features: [
      'Unlimited videos',
      'Unlimited duration',
      'No ads',
      'Priority support',
    ],
    button: 'Subscribe',
    highlight: true,
  },
  {
    name: '3 Months',
    price: '74.99',
    period: '3 months',
    features: [
      'Unlimited videos',
      'Unlimited duration',
      'No ads',
      'Priority support',
    ],
    button: 'Buy 3 Months',
    highlight: false,
  },
  {
    name: '12 Months',
    price: '299.99',
    period: '12 months',
    features: [
      'Unlimited videos',
      'Unlimited duration',
      'No ads',
      'Priority support',
    ],
    button: 'Buy 12 Months',
    highlight: false,
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
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-4xl mx-auto py-8">
        <h1 className="text-4xl font-bold text-center mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Pricing</h1>
        <p className="text-center text-gray-600 dark:text-gray-300 mb-8">Choose the plan that fits your needs. Upgrade anytime.</p>

        {/* Comparison Table */}
        <div className="overflow-x-auto mb-12">
          <table className="min-w-full border rounded-lg overflow-hidden bg-white dark:bg-gray-900">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left">Feature</th>
                <th className="px-4 py-2 text-center">Free</th>
                <th className="px-4 py-2 text-center">Paid</th>
              </tr>
            </thead>
            <tbody>
              {features.map((f) => (
                <tr key={f.label} className="border-t">
                  <td className="px-4 py-2 font-medium">{f.label}</td>
                  <td className="px-4 py-2 text-center">{f.free}</td>
                  <td className="px-4 py-2 text-center">{f.paid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`flex flex-col rounded-xl shadow-lg p-6 bg-white dark:bg-gray-900 border-2 ${plan.highlight ? 'border-blue-600 scale-105' : 'border-gray-200 dark:border-gray-700'} transition-transform`}
            >
              <h2 className="text-2xl font-bold mb-2 text-center">{plan.name}</h2>
              <div className="text-center mb-4">
                <span className="text-4xl font-extrabold">{plan.price === '0' ? 'Free' : `$${plan.price}`}</span>
                {plan.price !== '0' && <span className="text-base text-gray-500"> / {plan.period}</span>}
              </div>
              <ul className="flex-1 space-y-2 mb-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <button
                className={`w-full py-2 rounded-lg font-semibold transition-colors duration-200 ${plan.highlight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
                disabled={plan.price === '0'}
              >
                {plan.button}
              </button>
            </div>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="max-w-2xl mx-auto mt-12">
          <h3 className="text-2xl font-bold mb-4 text-center">Frequently Asked Questions</h3>
          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div key={idx} className="bg-white dark:bg-gray-900 rounded-lg shadow p-4">
                <div className="font-semibold mb-1">{faq.q}</div>
                <div className="text-gray-700 dark:text-gray-300">{faq.a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
} 
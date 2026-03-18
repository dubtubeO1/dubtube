import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Simple, transparent pricing for every creator. Start dubbing videos into any language with Starter, Pro, or Business plans.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

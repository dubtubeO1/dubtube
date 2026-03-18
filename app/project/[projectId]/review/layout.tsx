import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Review',
  description: 'Review your dubbed audio alongside the original video and download the final mix.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

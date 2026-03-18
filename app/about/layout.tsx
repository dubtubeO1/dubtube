import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About',
  description: 'Learn about DubTube — the AI-powered dubbing platform built for content creators.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

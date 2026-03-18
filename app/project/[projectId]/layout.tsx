import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Project Editor',
  description: 'Edit your transcript, adjust translations, and generate your dubbed audio.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Manage your dubbing projects and subscription.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

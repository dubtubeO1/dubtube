import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'New Project',
  description: 'Upload a video and start a new dubbing project.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

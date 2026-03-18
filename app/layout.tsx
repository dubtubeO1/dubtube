import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import { ClerkProvider } from '@clerk/nextjs';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL('https://dubtube.net'),
  title: {
    default: 'DubTube — AI-Powered Video Dubbing',
    template: '%s | DubTube',
  },
  description: 'AI video dubbing for content creators. Reach a global audience in 30+ languages — upload your video, pick a language, and get professional dubbed audio in minutes.',
  openGraph: {
    type: 'website',
    siteName: 'DubTube',
    title: 'DubTube — AI-Powered Video Dubbing',
    description: 'AI video dubbing for content creators. Reach a global audience in 30+ languages — upload your video, pick a language, and get professional dubbed audio in minutes.',
    images: [{ url: '/Logo_Banner.png', width: 1200, height: 630, alt: 'DubTube' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DubTube — AI-Powered Video Dubbing',
    description: 'AI video dubbing for content creators. Reach a global audience in 30+ languages — upload your video, pick a language, and get professional dubbed audio in minutes.',
    images: ['/Logo_Banner.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={inter.className}>
          <Navbar />
          {children}
          <Footer />
        </body>
      </html>
    </ClerkProvider>
  );
}

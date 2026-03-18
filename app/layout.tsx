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
  description: 'Upload your video and get AI-powered dubbed audio in any language — powered by Whisper, DeepL, and ElevenLabs.',
  openGraph: {
    type: 'website',
    siteName: 'DubTube',
    title: 'DubTube — AI-Powered Video Dubbing',
    description: 'Upload your video and get AI-powered dubbed audio in any language — powered by Whisper, DeepL, and ElevenLabs.',
    images: [{ url: '/Logo_Banner.png', width: 1200, height: 630, alt: 'DubTube' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DubTube — AI-Powered Video Dubbing',
    description: 'Upload your video and get AI-powered dubbed audio in any language — powered by Whisper, DeepL, and ElevenLabs.',
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

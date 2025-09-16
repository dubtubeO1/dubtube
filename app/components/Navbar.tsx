'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from '@clerk/nextjs';
import { Menu, X } from 'lucide-react';

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center group">
              <span className="text-xl font-bold bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 bg-clip-text text-transparent group-hover:from-slate-800 group-hover:to-slate-600 transition-all duration-300">
                DubTube
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden sm:flex sm:items-center sm:space-x-6">
            <Link
              href="/pricing"
              className="text-slate-600 hover:text-slate-900 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 hover:bg-slate-100"
            >
              Pricing
            </Link>
            <Link
              href="/about"
              className="text-slate-600 hover:text-slate-900 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 hover:bg-slate-100"
            >
              About
            </Link>
            <SignedIn>
              <Link
                href="/dashboard"
                className="text-slate-600 hover:text-slate-900 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 hover:bg-slate-100"
              >
                Dashboard
              </Link>
            </SignedIn>
            
            <SignedOut>
              <SignInButton mode="modal">
                <button className="bg-gradient-to-r from-slate-700 to-slate-600 text-white px-6 py-2 rounded-xl text-sm font-medium hover:from-slate-800 hover:to-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl">
                  Sign In
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="ml-3 bg-white/80 text-slate-700 border border-slate-300 px-6 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-all duration-300 backdrop-blur-sm">
                  Sign Up
                </button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <div className="ml-3">
                <UserButton 
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      avatarBox: "w-8 h-8 rounded-xl",
                      userButtonPopoverCard: "bg-white/90 backdrop-blur-md border border-slate-200 rounded-2xl shadow-xl",
                      userButtonPopoverActionButton: "hover:bg-slate-100 rounded-xl transition-all duration-300"
                    }
                  }}
                />
              </div>
            </SignedIn>
          </div>

          {/* Mobile menu button */}
          <div className="sm:hidden flex items-center">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-all duration-300"
            >
              <span className="sr-only">Open main menu</span>
              {!isMenuOpen ? (
                <Menu className="h-6 w-6" />
              ) : (
                <X className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="sm:hidden bg-white/95 backdrop-blur-md border-t border-slate-200">
          <div className="px-4 pt-4 pb-6 space-y-3">
            <Link
              href="/pricing"
              className="text-slate-600 hover:text-slate-900 block px-4 py-3 rounded-xl text-base font-medium transition-all duration-300 hover:bg-slate-100"
              onClick={() => setIsMenuOpen(false)}
            >
              Pricing
            </Link>
            <Link
              href="/about"
              className="text-slate-600 hover:text-slate-900 block px-4 py-3 rounded-xl text-base font-medium transition-all duration-300 hover:bg-slate-100"
              onClick={() => setIsMenuOpen(false)}
            >
              About
            </Link>
            <SignedIn>
              <Link
                href="/dashboard"
                className="text-slate-600 hover:text-slate-900 block px-4 py-3 rounded-xl text-base font-medium transition-all duration-300 hover:bg-slate-100"
                onClick={() => setIsMenuOpen(false)}
              >
                Dashboard
              </Link>
            </SignedIn>
            <SignedOut>
              <div className="space-y-3 pt-2">
                <SignInButton mode="modal">
                  <button className="w-full bg-gradient-to-r from-slate-700 to-slate-600 text-white px-6 py-3 rounded-xl text-base font-medium hover:from-slate-800 hover:to-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl">
                    Sign In
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="w-full bg-white/80 text-slate-700 border border-slate-300 px-6 py-3 rounded-xl text-base font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-all duration-300 backdrop-blur-sm">
                    Sign Up
                  </button>
                </SignUpButton>
              </div>
            </SignedOut>
            <SignedIn>
              <div className="flex justify-center pt-2">
                <UserButton 
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      avatarBox: "w-10 h-10 rounded-xl",
                      userButtonPopoverCard: "bg-white/90 backdrop-blur-md border border-slate-200 rounded-2xl shadow-xl",
                      userButtonPopoverActionButton: "hover:bg-slate-100 rounded-xl transition-all duration-300"
                    }
                  }}
                />
              </div>
            </SignedIn>
          </div>
        </div>
      )}
    </nav>
  );
} 
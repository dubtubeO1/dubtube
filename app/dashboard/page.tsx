'use client'

import { useUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import { getUserFromSupabase, UserData } from '@/lib/user-sync'
import { supabase } from '@/lib/supabase'
import { User, CreditCard, BarChart3, Settings, Calendar, CheckCircle } from 'lucide-react'

export default function Dashboard() {
  const { user, isLoaded } = useUser()
  const [userData, setUserData] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isLoaded && user) {
      fetchUserData()
    }
  }, [isLoaded, user])

  const fetchUserData = async () => {
    if (!user) return

    try {
      const data = await getUserFromSupabase(user.id)
      setUserData(data)
    } catch (error) {
      console.error('Error fetching user data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!isLoaded || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-700 mb-4">Please sign in</h1>
          <p className="text-slate-600">You need to be signed in to view your dashboard.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Header */}
      <div className="bg-white/50 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-700">Dashboard</h1>
              <p className="text-slate-600 mt-1">Welcome back, {user.firstName}!</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm text-slate-500">Account Status</p>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium text-green-600 capitalize">
                    {userData?.subscription_status || 'Free'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Account Info Card */}
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 border border-slate-200 shadow-lg">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-slate-100 rounded-lg">
                <User className="w-5 h-5 text-slate-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700">Account Info</h3>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-slate-500">Email</p>
                <p className="text-slate-700">{user.emailAddresses[0]?.emailAddress}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Member Since</p>
                <p className="text-slate-700">
                  {userData?.created_at ? new Date(userData.created_at).toLocaleDateString() : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Plan</p>
                <p className="text-slate-700 capitalize">{userData?.plan_name || 'Free'}</p>
              </div>
            </div>
          </div>

          {/* Subscription Card */}
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 border border-slate-200 shadow-lg">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-slate-100 rounded-lg">
                <CreditCard className="w-5 h-5 text-slate-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700">Subscription</h3>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-slate-500">Status</p>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${
                    userData?.subscription_status === 'active' ? 'bg-green-500' : 'bg-slate-400'
                  }`}></div>
                  <p className="text-slate-700 capitalize">{userData?.subscription_status || 'Free'}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-500">Current Plan</p>
                <p className="text-slate-700 capitalize">{userData?.plan_name || 'Free'}</p>
              </div>
              <button 
                onClick={async () => {
                  try {
                    const response = await fetch('/api/stripe/portal', {
                      method: 'POST',
                    });
                    const { url } = await response.json();
                    if (url) {
                      window.location.href = url;
                    }
                  } catch (error) {
                    console.error('Error opening billing portal:', error);
                  }
                }}
                className="w-full mt-4 py-2 px-4 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                Manage Subscription
              </button>
            </div>
          </div>

          {/* Usage Stats Card */}
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 border border-slate-200 shadow-lg">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-slate-100 rounded-lg">
                <BarChart3 className="w-5 h-5 text-slate-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700">Usage Stats</h3>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-slate-500">Videos Processed</p>
                <p className="text-2xl font-bold text-slate-700">{userData?.videos_processed || 0}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Duration</p>
                <p className="text-2xl font-bold text-slate-700">{Math.round((userData?.total_duration_seconds || 0) / 60)} min</p>
              </div>
              <button className="w-full mt-4 py-2 px-4 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors">
                View Details
              </button>
            </div>
          </div>

        </div>

        {/* Quick Actions */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold text-slate-700 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button className="flex items-center space-x-3 p-4 bg-white/70 backdrop-blur-sm rounded-xl border border-slate-200 hover:bg-white/90 transition-colors">
              <Settings className="w-5 h-5 text-slate-600" />
              <span className="text-slate-700">Account Settings</span>
            </button>
            <button className="flex items-center space-x-3 p-4 bg-white/70 backdrop-blur-sm rounded-xl border border-slate-200 hover:bg-white/90 transition-colors">
              <CreditCard className="w-5 h-5 text-slate-600" />
              <span className="text-slate-700">Billing History</span>
            </button>
            <button className="flex items-center space-x-3 p-4 bg-white/70 backdrop-blur-sm rounded-xl border border-slate-200 hover:bg-white/90 transition-colors">
              <Calendar className="w-5 h-5 text-slate-600" />
              <span className="text-slate-700">Usage History</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

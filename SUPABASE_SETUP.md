# Supabase Setup Guide for DubTube

## 🚀 Step-by-Step Setup Instructions

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Choose your organization
5. Enter project details:
   - **Name**: `dubtube-database`
   - **Database Password**: Generate a strong password
   - **Region**: Choose closest to your users
6. Click "Create new project"
7. Wait for project to be ready (2-3 minutes)

### 2. Get Supabase Credentials

1. Go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (starts with `https://`)
   - **anon public** key (starts with `eyJ`)

### 3. Set Up Database Schema

1. Go to **SQL Editor** in your Supabase dashboard
2. Click "New Query"
3. Copy and paste the contents of `supabase-schema.sql`
4. Click "Run" to execute the schema

### 4. Configure Environment Variables

Add these to your `.env.local` file:

```env
# Supabase Database
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Clerk Webhook (for user sync)
CLERK_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### 5. Set Up Clerk Webhook

1. Go to your [Clerk Dashboard](https://dashboard.clerk.com)
2. Select your project
3. Go to **Webhooks**
4. Click "Add Endpoint"
5. Enter your webhook URL: `https://your-domain.com/api/webhooks/clerk`
6. Select these events:
   - `user.created`
   - `user.updated`
   - `user.deleted`
7. Copy the webhook secret and add it to your environment variables

### 6. Test the Integration

1. Start your development server: `npm run dev`
2. Sign up for a new account
3. Check your Supabase dashboard → **Table Editor** → **users**
4. You should see a new user record created automatically

## 📊 Database Tables Created

### `users` table
- Stores user information linked to Clerk
- Fields: id, clerk_user_id, email, subscription_status, plan_name, created_at, updated_at

### `subscriptions` table
- Stores subscription and billing information
- Fields: id, user_id, stripe_subscription_id, status, plan_name, current_period_start, current_period_end

### `usage_tracking` table
- Tracks user usage statistics
- Fields: id, user_id, videos_processed, total_duration_seconds, last_reset_date

## 🔒 Security Features

- **Row Level Security (RLS)** enabled on all tables
- Users can only access their own data
- Secure policies prevent unauthorized access

## 🎯 Next Steps

1. **Test user sync** - Sign up and verify user appears in Supabase
2. **Add Stripe integration** - For subscription management
3. **Implement usage tracking** - Track video processing
4. **Add subscription management** - Allow users to upgrade/downgrade

## 🆘 Troubleshooting

### User not syncing to Supabase
- Check webhook URL is correct
- Verify webhook secret in environment variables
- Check Clerk webhook logs for errors

### Database connection issues
- Verify Supabase URL and anon key
- Check if project is active (not paused)
- Ensure RLS policies are set up correctly

### Dashboard not loading
- Check if user is signed in with Clerk
- Verify Supabase connection
- Check browser console for errors

## 📚 Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Clerk Webhooks](https://clerk.com/docs/webhooks)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

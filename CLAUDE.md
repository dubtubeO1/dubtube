# CLAUDE.md — Dubtube Developer Guide

This file is read automatically by Claude Code at the start of every session.
Always follow these conventions when adding or modifying code in this project.

---

## Project Overview

Dubtube is a Next.js SaaS app that generates AI-powered dubbed audio from user-uploaded videos.
Full product details are in `PRD.md`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS v4 |
| Auth | Clerk |
| Database | Supabase (PostgreSQL) |
| File Storage | Cloudflare R2 |
| Payments | Stripe |
| Hosting | Railway |

**External APIs:** Lemonfox AI (Whisper), DeepL, ElevenLabs

---

## Folder Structure

```
app/
  layout.tsx                  # Root layout — Navbar imported here
  page.tsx                    # Homepage (/)
  globals.css                 # Tailwind import + custom keyframes (shimmer, blob, gradient)
  components/
    Navbar.tsx                # Shared components go here (PascalCase)
  api/
    extract-audio/route.ts    # API routes go here, one folder per endpoint
    upload-video/route.ts
    me/subscription/route.ts
    stripe/checkout/route.ts
  pricing/page.tsx
  about/page.tsx
  dashboard/page.tsx
  video/[videoId]/page.tsx
  [videoId]/error.tsx
```

### Rules for new files

- New **shared components** → `app/components/ComponentName.tsx`
- New **page-specific components** → keep in the page file itself unless reused elsewhere
- New **API endpoints** → `app/api/[endpoint-name]/route.ts`
- New **utility/helper modules** → `lib/` at project root (e.g. `lib/r2.ts`, `lib/supabase.ts`)
- New **type definitions** → `lib/types.ts` or colocated in the relevant module
- New **pages** → `app/[route]/page.tsx` following App Router convention

---

## TypeScript

- Strict mode is enabled (`"strict": true` in tsconfig.json). Never disable it.
- Never use `any`. Use `unknown` and narrow the type, or define a proper interface.
- Path alias `@/*` maps to the project root. Always use it for imports:
  ```ts
  // Correct
  import { supabaseAdmin } from '@/lib/supabaseAdmin'

  // Wrong
  import { supabaseAdmin } from '../../lib/supabaseAdmin'
  ```
- Export one default per component file. Named exports are fine for utilities and types.

---

## Component Conventions

- **PascalCase** for all component names and their files: `export default function ProjectCard()`
- Add `'use client'` at the top only when the component uses client-side state or browser APIs
- Server Components are the default in App Router — prefer them unless interactivity is needed
- Keep page-level JSX in `page.tsx` unless a component is reused across multiple pages

---

## API Route Conventions

- One folder per endpoint under `app/api/`, one `route.ts` file inside
- Handler function names follow Next.js convention: `GET`, `POST`, `PUT`, `DELETE`
- Always authenticate with Clerk at the start of every protected route:
  ```ts
  import { auth } from '@clerk/nextjs/server'

  export async function POST(req: Request) {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // ...
  }
  ```
- Always check subscription status for routes that consume paid features (follow the pattern in existing routes like `app/api/me/subscription/route.ts`)
- Return format: `NextResponse.json({ ... })` for standard responses
- For streaming responses (pipeline progress): use NDJSON (`application/x-ndjson`), following the pattern in `app/api/extract-audio/route.ts`

---

## Styling

- Tailwind CSS v4 — imported in `globals.css` via `@import "tailwindcss"`
- Use Tailwind utility classes for all styling. Do not write inline styles.
- Custom animations (shimmer, blob, gradient) are defined in `globals.css` — reuse them, do not duplicate
- Design language: modern, minimal, slate/gray palette (slate-50 to slate-900), dark mode supported
- All new UI must support dark mode using Tailwind's `dark:` prefix
- Mobile-first responsive design — use `md:` and `lg:` prefixes for larger breakpoints

---

## Supabase

- Use `supabaseAdmin` (service role) for server-side DB operations in API routes
- Use the regular `supabase` client (anon key) only for client-side reads where RLS allows
- Never expose the service role key to the client

**Existing tables:** `users`, `subscriptions`, `usage_tracking`

**New tables (v2):** `projects`, `transcripts`, `speakers` — see PRD.md Section 5 for full schema

---

## Cloudflare R2

- R2 is S3-compatible. Use `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`. Do not use any Cloudflare-specific SDK.
- Client uploads go directly from the browser to R2 via presigned URLs — files must NOT be routed through the Next.js backend
- R2 utility functions go in `lib/r2.ts`
- Key naming convention: `{userId}/{projectId}/{fileType}/{filename}`
  - Example: `user_abc123/proj_xyz/video/recording.mp4`
  - Example: `user_abc123/proj_xyz/audio/segment_003.mp3`
- When a project is deleted, all associated R2 files must be deleted before removing the Supabase record

---

## Background Jobs (Railway Worker)

- Long-running pipeline tasks (transcription, translation, TTS, merge) run on a separate Railway worker service — NOT in Next.js API routes
- Next.js API routes only: trigger the job and return a job ID immediately
- Pipeline status is written to the `projects.status` column in Supabase after each stage
- The frontend polls or subscribes to `projects.status` to show progress — do not use websockets unless necessary

---

## Auth & Subscription Gating Pattern

Every protected API route and page must follow this order:
1. Check Clerk auth → 401 if not authenticated
2. Check active subscription in Supabase → redirect to `/pricing` if no active subscription
3. Check plan limits (project count, file size, duration) → 403 with clear error message if limit exceeded

---

## Error Handling

- API routes must always return a meaningful error message and appropriate HTTP status code
- Never swallow errors silently
- Log errors server-side with enough context to debug (include userId, projectId where relevant)
- Client-side errors should be shown as toast notifications (small, auto-dismissing, top-right corner)

---

## Things to Never Do

- Never use `any` in TypeScript
- Never route large file uploads through Next.js API routes (use presigned R2 URLs)
- Never run long-running tasks inside Next.js API routes (use the Railway worker)
- Never expose Supabase service role key or R2 secret key to the client
- Never use relative import paths — always use the `@/` alias
- Never write inline styles — use Tailwind classes
- Never create a new Stripe plan without removing the old ones first (see PRD.md Section 6)
- Never add browser push notifications — use toast only

## MCP Usage Rules

- Always use Context7 MCP when writing code that involves external libraries
  or frameworks (Next.js, Tailwind, Clerk, Supabase, Stripe, ElevenLabs, etc.)
  to ensure documentation is current and accurate.
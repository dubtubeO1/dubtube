# Dubtube — Product Requirements Document (PRD)
**Version:** 2.1 (Post-MVP Roadmap)
**Last Updated:** March 2026
**Status:** Active Development

---

## 1. Project Overview

Dubtube is a SaaS application that enables users to create AI-powered dubbed versions of video content in different languages. This PRD covers the second major version of the application.

**v1 (Current):** Users entered a YouTube video URL to generate a dubbed version. This feature is currently non-functional due to YouTube's migration to the SABR format, which yt-dlp does not yet support.

**v2 (This PRD):** The target audience shifts from YouTube viewers to content creators. Users upload their own local video files, generate a dubbed audio track, edit the transcript and translation, and download the final dubbed audio to use on their own channels.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js |
| Auth | Clerk |
| Database | Supabase (PostgreSQL) |
| File Storage | Cloudflare R2 |
| Payments | Stripe |
| CDN / Bot Protection | Cloudflare |
| Hosting | Railway |
| Version Control | Git / GitHub |

**External APIs:**
- **Lemonfox AI (Whisper)** — Transcription and diarization (speaker separation)
- **DeepL** — Text translation
- **ElevenLabs** — TTS and voice cloning

---

## 3. Current State

The following features are fully functional:

- Clerk Auth: Email and Google sign-up/login
- Supabase DB: User and subscription data
- Stripe: Payment processing and subscription management
- Cloudflare: Bot/crawler protection
- Dubbing pipeline (transcription → translation → TTS → merge): Fully functional
- Cloudflare R2: Video and audio file storage
- Project management: Create, view, delete projects
- Transcript editor: Side-by-side original and translated transcript editing
- Per-segment audio playback and regeneration
- Review page: Video + dubbed audio sync player, audio timeline with drag-to-reorder, download button

**The only broken piece:** YouTube video fetching via yt-dlp due to the SABR format change.

---

## 4. Existing Supabase Tables

### `users`
| Column | Type |
|---|---|
| id | uuid (PK) |
| clerk_user_id | text |
| email | text |
| subscription_status | text |
| plan_name | text |
| created_at | timestamptz |
| updated_at | timestamptz |
| stripe_customer_id | text |

### `subscriptions`
| Column | Type |
|---|---|
| id | uuid (PK) |
| user_id | uuid (FK) |
| stripe_subscription_id | text |
| status | text |
| plan_name | text |
| current_period_start | timestamptz |
| current_period_end | timestamptz |
| created_at | timestamptz |
| updated_at | timestamptz |
| stripe_price_id | text |
| cancel_at_period_end | bool |
| stripe_customer_id | text |
| stripe_product_id | text |

### `usage_tracking`
| Column | Type |
|---|---|
| id | uuid (PK) |
| user_id | uuid (FK) |
| videos_processed | int4 |
| total_duration_seconds | int4 |
| last_reset_date | date |
| created_at | timestamptz |

---

## 5. Supabase Tables

### `projects`
| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK → users) | |
| title | text | Project name (auto-populated from video filename) |
| status | text | uploading, ready, queued, transcribing, translating, generating_audio, completed, delivering, delivered, error |
| source_language | text | Original video language |
| target_language | text | Target dubbing language |
| video_r2_key | text | R2 key for the uploaded video file |
| audio_r2_key | text | R2 key for the extracted audio file |
| dubbed_audio_r2_key | text | R2 key for the final dubbed audio file |
| video_duration_seconds | float4 | Video duration in seconds |
| video_size_bytes | int8 | Video file size in bytes |
| error_message | text | Description in case of pipeline error |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| deleted_at | timestamptz | For soft delete / grace period logic |

### `transcripts`
| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | |
| project_id | uuid (FK → projects) | |
| speaker_id | text | SPEAKER_0, SPEAKER_1, etc. |
| speaker_name | text | User-editable display name |
| start_time | float4 | Segment start timestamp (seconds) |
| end_time | float4 | Segment end timestamp (seconds) |
| original_text | text | Original transcribed text |
| translated_text | text | Translated text |
| segment_audio_r2_key | text | R2 key for this segment's generated audio |
| voice_id | text | ElevenLabs voice ID used |
| is_cloned | bool | Whether voice cloning was used |
| duration_match | bool | Whether to stretch/compress audio to fit original segment timing |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `speakers`
| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | |
| project_id | uuid (FK → projects) | |
| speaker_id | text | SPEAKER_0, etc. |
| speaker_name | text | User-assigned display name |
| voice_id | text | ElevenLabs voice ID |
| is_cloned | bool | |
| cloned_voice_r2_key | text | R2 key of the audio used for cloning |
| created_at | timestamptz | |

---

## 6. Pricing & Plans

### Plan Limits

| Feature | Starter | Pro | Business |
|---|---|---|---|
| Monthly project limit | 3 | 10 | Unlimited |
| Max video file size | 1 GB | 3 GB | 10 GB |
| Supported languages | All | All | All |
| Voice cloning | Yes | Yes | Yes |
| Priority processing | No | No | Yes |

### Pricing

| Plan | Monthly | Quarterly | Yearly |
|---|---|---|---|
| Starter | $19.99/mo | $49.99/qtr | $159.99/yr |
| Pro | $49.99/mo | $119.99/qtr | $399.99/yr |
| Business | $89.99/mo | $199.99/qtr | $899.99/yr |

> **Note:** All existing Stripe plans will be removed and recreated fresh. No migration strategy is required as there are no active subscribers on the existing plans.

---

## 7. User Flow (v2)

### 7.1 Homepage

The homepage serves as the primary entry point for both product tracks. It includes:

- App description and hero section with a clear CTA
- A large drag & drop video upload area (for the Creator Dubbing track)
- Two tabs to switch between product tracks:
  - **"For Creators"** (active) — local video upload and dubbing
  - **"For Viewers"** (inactive, coming soon badge) — YouTube URL dubbing

The two-tab structure lives on the homepage itself, making the distinction immediately visible to new visitors without cluttering the navigation bar.

**Upload & Auth Flow:**
When a user drags a video onto the homepage upload area:
1. If not logged in → redirect to Clerk login/signup
2. If logged in but no active subscription → redirect to /pricing
3. If logged in with active subscription → proceed to language selection and project creation (/dashboard/new)

### 7.2 Navigation

The top navigation bar includes:
- Logo / Brand (links to homepage)
- Dashboard (visible when logged in)
- Pricing
- Login / Sign Up (when logged out) or User Menu (when logged in)

### 7.3 Dashboard (/dashboard)

- User's existing projects displayed as cards
- Each card shows: project title, target language, status badge, creation date, progress percentage
- "New Project" button to start a new project
- Subscription status and usage stats (projects used this month, remaining quota)

### 7.4 New Project (/dashboard/new)

**Step 1 — Video Upload:**
- Large drag & drop area
- Supported formats: MP4, MOV, AVI, MKV, WebM
- File size limit validated against user's plan before upload begins
- Upload progress bar (direct upload to R2 via presigned URL)
- On successful upload, project is created and user is redirected to /project/[id]

**Step 2 — Language Selection:**
- Source language (auto-detected, user can override)
- Target dubbing language dropdown (all supported languages)
- "Start Processing" button

### 7.5 Project Detail Page (/project/[id])

#### Stage 1: Processing

After the user clicks "Start Processing", an asynchronous background pipeline begins on the Railway worker service:

1. Audio is extracted from the video file (read from R2, processed, saved back to R2)
2. Lemonfox Whisper API transcribes the audio with diarization (SPEAKER_0, SPEAKER_1...)
3. Transcript is saved to Supabase
4. DeepL API translates the transcript to the target language
5. Translation is saved to Supabase
6. ElevenLabs TTS generates audio for each segment using a default voice (voice cloning is a post-MVP feature — see Milestone 9)
7. Individual segment audio files are uploaded to R2; the final dubbed audio mix is generated separately when the user clicks "Generate Dubbed Audio"

**UI — Loading State:**
- Step-by-step progress indicator (each pipeline stage shown as a row with a status icon)
- User can close the page; processing continues in the background on the Railway worker
- When the user returns to the page, it reflects the current pipeline status

#### Stage 2: Transcript Editing

**Left Panel — Original Transcript:**
- Each segment: timestamp | speaker name | text
- Speaker names are editable (SPEAKER_0 → "John", SPEAKER_1 → "Jane")
- Segment text is inline-editable

**Right Panel — Translated Transcript:**
- Same structure, showing translated text
- Each segment is inline-editable
- Play icon per row to listen to that segment's dubbed audio
- Regenerate icon per row to regenerate just that segment's audio

**Top Bar:**
- Manual save button
- Autosave: every 30 seconds or 3 seconds after the last edit
- "Saved" / "Saving…" status indicator

**Speaker Management:**
- Per speaker: name (editable)
- Voice selection and voice cloning UI are not yet implemented (see Milestone 9)

#### Stage 3: Review Page (/project/[id]/review)

When the user clicks "Generate Dubbed Audio", they are immediately redirected to the review page. The page shows a loading state (same pattern as the processing screen) while the background job runs. Content loads automatically when the job completes.

- Top: original video player and final dubbed audio player in sync mode, with sync toggle (enabled/disabled)
- Middle: audio timeline editor showing individual segment clips in order — user can drag to reorder segments, play individual segments
- "Regenerate Mix" button appears when the user reorders segments — re-mixes existing R2 segment files in the new order without re-running the full pipeline
- Bottom: download button (MP3) and "Back to Transcript" link

**Audio editor scope (v1):**
- Drag to reorder segments: yes
- Play individual segments: yes
- Trim and merge: post-MVP

---

## 8. Data Retention & Deletion Policy

- **User deletes a project:** All R2 files (video, audio, segments) and all Supabase records are permanently deleted immediately.
- **User cancels subscription:** Projects are retained for 90 days. If the subscription is not renewed within 90 days, all projects and associated files are permanently deleted. Warning emails at 30, 7, and 1 day(s) before deletion are planned but not yet implemented (see Milestone 8).
- **Active subscription:** Projects are retained indefinitely (within plan limits).

---

## 9. YouTube Dubbing Feature (v1 — Disabled)

- Accessible from the homepage via the "For Viewers" tab
- Tab is visible but in a disabled/inactive state with a "Coming Soon" badge
- Not clickable; no interaction possible
- All underlying code is preserved in the codebase; only UI access is blocked
- Will be re-enabled via a feature flag once yt-dlp supports the SABR format

---

## 10. Design System

- **Style:** Modern, minimal, tech-focused
- **Color palette:** Slate/gray tones (slate-50 → slate-900)
- **Dark mode:** Supported
- **Animations:** Subtle, smooth transitions; floating blob backgrounds
- **Typography:** Bold gradient headings, light weight body text
- **Responsive:** Mobile-first

Reference prompt used for the original design:
"Modern and minimal aesthetic with a tech-focused neutral color palette. Use slate/gray tones (slate-50 to slate-900). Gradient backgrounds (bg-gradient-to-br from-slate-50 via-white to-slate-100). Dark mode support. Large bold gradient text for main headings (text-6xl md:text-8xl). Typing animation effect. Floating blob background elements. Subtle dividers with dots and lines. Mobile-first responsive design."

---

## 11. Completed Milestones

### Milestone 1 — Storage & DB Infrastructure ✓
### Milestone 2 — Video Upload UI ✓
### Milestone 3 — Async Pipeline Integration ✓
### Milestone 4 — Project Detail Page & Transcript Editor ✓
### Milestone 5 — Review Page & Dashboard Polish ✓
### Milestone 6 — Pricing & Plan Management ✓
(Warning emails pending — see Milestone 7)

---

## 12. Upcoming Milestones

### Milestone 7 — Launch Essentials (Before or at launch)
- Legal pages: Terms of Service, Privacy Policy, Refund Policy — linked from Stripe checkout and footer
- Logo and favicon
- Open Graph / meta tags (title, description, preview image per page — controls how the site appears in Google search results and social media shares)
- Retry button for failed projects on the dashboard

### Milestone 8 — Stability & Observability (Immediately after launch)
- Error monitoring: Sentry integration (free tier)
- Analytics: Posthog or Plausible integration
- Rate limiting on API endpoints (upload, pipeline trigger)
- Warning emails via Resend: notify users at 30, 7, and 1 day(s) before project deletion after subscription cancellation
- Activate usage_tracking table: display real usage data in dashboard ("2/3 projects used this month")

### Milestone 9 — Voice Cloning
- Per-speaker voice cloning on the transcript page
- Clone Voice button active when speaker has 60+ seconds of audio
- Cloned voice selection in speaker management panel
- Fallback to default ElevenLabs voice when cloning is unavailable

### Milestone 10 — SEO & Discoverability
- SEO optimization: structured data, sitemap, robots.txt, canonical URLs
- Homepage onboarding copy: clearer explainer of what Dubtube does, who it's for, and how it works
- User feedback widget (e.g. "How was your experience?")

### Milestone 11 — Homepage Redesign
- Content-creator focused visual redesign
- Social proof: showcase well-known YouTubers, channels, or use cases
- Before/after audio demos
- Refined onboarding flow

### Milestone 12 — Advanced Audio Editor
- Trim individual segments
- Merge adjacent segments
- Gap adjustment between segments
- Full timeline DAW-like interface (scoped conservatively)

### Milestone 13 — YouTube Integration
- Connect YouTube account via Clerk OAuth
- One-click: add dubbed audio track directly to an existing YouTube video
- Requires YouTube Data API v3 integration

### Milestone 14 — YouTube Dubbing (v1 Reactivation)
- Re-enable YouTube URL dubbing flow once yt-dlp supports SABR format
- Feature flag toggle in admin/config
- "For Viewers" tab becomes active

---

## 13. Open Decisions

- **Email service:** Resend selected, not yet implemented
- **Analytics tool:** Posthog vs Plausible — not yet decided
- **YouTube integration:** Requires YouTube Data API approval process — plan ahead
- **Voice cloning UX:** Exact UI flow for cloning on the transcript page to be designed at implementation time

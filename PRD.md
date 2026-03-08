# Dubtube — Product Requirements Document (PRD)
**Version:** 2.0 (Creator Edition)
**Last Updated:** February 2026
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

The following features are fully functional and will be preserved in this version:

- Clerk Auth: Email and Google sign-up/login
- Supabase DB: User and subscription data
- Stripe: Payment processing and subscription management
- Cloudflare: Bot/crawler protection
- Dubbing pipeline (transcription → translation → TTS → merge): Fully functional

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

## 5. New Supabase Tables (v2)

### `projects`
| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK → users) | |
| title | text | Project name (auto-populated from video filename) |
| status | text | uploading, transcribing, transcribed, translating, translated, generating_audio, completed, error |
| source_language | text | Original video language |
| target_language | text | Target dubbing language |
| video_r2_key | text | R2 key for the uploaded video file |
| audio_r2_key | text | R2 key for the extracted audio file |
| dubbed_audio_r2_key | text | R2 key for the final dubbed audio file |
| video_duration_seconds | int4 | Video duration in seconds |
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

The two product tracks (Creator / Viewer) are surfaced on the homepage via tabs, not in the navigation bar, to keep the nav clean and uncluttered.

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

This is the main workspace page for a project, covering all stages of the dubbing process.

---

#### Stage 1: Processing

After the user clicks "Start Processing", an asynchronous background pipeline begins on the Railway worker service:

1. Audio is extracted from the video file (read from R2, processed, saved back to R2)
2. Lemonfox Whisper API transcribes the audio with diarization (SPEAKER_0, SPEAKER_1...)
3. Transcript is saved to Supabase
4. DeepL API translates the transcript to the target language
5. Translation is saved to Supabase
6. ElevenLabs TTS generates audio for each segment
7. If a speaker has 60+ seconds of audio, their voice is cloned; otherwise a default voice is used
8. All segment audio files are merged into the final dubbed audio track

**UI — Loading State:**
- Step-by-step progress indicator (each pipeline stage shown as a row with a status icon)
- User can close the page; processing continues in the background on the Railway worker
- When processing completes, a small toast notification appears in the top-right corner of the screen and auto-dismisses within 5–10 seconds
- When the user returns to the page, it reflects the current pipeline status

---

#### Stage 2: Transcript Editing

Once processing completes, the user is presented with the editing interface:

**Left Panel — Original Transcript:**
- Each segment: timestamp | speaker name | text
- Speaker names are editable (SPEAKER_0 → "John", SPEAKER_1 → "Jane")
- Segment text is inline-editable
- Play icon per row to listen to that segment's original audio

**Right Panel — Translated Transcript:**
- Same structure, showing translated text
- Each segment is inline-editable
- Play icon per row to listen to that segment's dubbed audio
- Regenerate icon per row to regenerate just that segment's audio

**Top Bar:**
- Manual save button
- Autosave: every 30 seconds or 3 seconds after the last edit
- "Last saved: 2 minutes ago" indicator

**Speaker Management:**
- Per speaker: name, assigned voice, cloning status
- Voice selection: "Cloned voice" or a default ElevenLabs voice
- "Clone Voice" button is active if the speaker's total audio duration is 60+ seconds

---

#### Stage 3: Final Dubbed Audio

- All segment audio files are merged
- Media player to listen to the final dubbed audio
- Original video and dubbed audio playable in sync mode (sync logic carried over from v1)
- Sync toggle (enabled/disabled)
- Download button: download the final dubbed audio (MP3 / WAV)
- Regenerate button: regenerate the full dub based on current transcript edits

---

## 8. Data Retention & Deletion Policy

- **User deletes a project:** All R2 files (video, audio, segments) and all Supabase records are permanently deleted immediately.
- **User cancels subscription:** Projects are retained for 90 days. If the subscription is not renewed within 90 days, all projects and associated files are permanently deleted. Warning emails are sent at 30, 7, and 1 day(s) before deletion.
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

The existing design language is preserved across all new screens:

- **Style:** Modern, minimal, tech-focused
- **Color palette:** Slate/gray tones (slate-50 → slate-900)
- **Dark mode:** Supported
- **Animations:** Subtle, smooth transitions; floating blob backgrounds
- **Typography:** Bold gradient headings, light weight body text
- **Responsive:** Mobile-first

Reference prompt used for the original design:
"Modern and minimal aesthetic with a tech-focused neutral color palette. Use slate/gray tones (slate-50 to slate-900). Gradient backgrounds (bg-gradient-to-br from-slate-50 via-white to-slate-100). Dark mode support. Large bold gradient text for main headings (text-6xl md:text-8xl). Typing animation effect. Floating blob background elements. Subtle dividers with dots and lines. Mobile-first responsive design."

---

## 11. Milestone Plan

### Milestone 1 — Storage & DB Infrastructure
- Cloudflare R2 bucket setup and Next.js integration (presigned URL upload)
- Add projects, transcripts, speakers tables to Supabase
- File deletion mechanism (R2 cleanup when a project is deleted)

### Milestone 2 — Video Upload UI
- Homepage two-tab layout (For Creators / For Viewers)
- Drag & drop video upload area on homepage and /dashboard/new
- Auth and subscription gating on upload action
- Plan-based size/duration validation before upload
- Upload progress bar
- Language selection screen

### Milestone 3 — Async Pipeline Integration
- Decouple existing dubbing pipeline from YouTube URL dependency
- New endpoint that reads video from R2 and triggers the pipeline
- Railway worker service for background job processing
- Supabase status updates per pipeline stage
- Toast notification on completion

### Milestone 4 — Project Detail Page & Transcript Editor
- /project/[id] page
- Loading state with step-by-step progress
- Side-by-side original + translated transcript editor
- Speaker name editing
- Per-segment audio playback and regeneration
- Autosave + manual save

### Milestone 5 — Final Dubbed Audio & Dashboard Polish
- Final dubbed audio media player
- Video + dubbed audio sync player
- Download button (MP3 / WAV)
- Dashboard: project list, usage stats
- "For Viewers" tab (disabled / coming soon)

### Milestone 6 — Pricing & Plan Management
- Remove existing Stripe plans and create new Starter / Pro / Business plans
- Plan-based limit enforcement throughout the app
- 90-day data retention logic on subscription cancellation
- Warning emails at 30, 7, and 1 day(s) before deletion

---

## 12. Nice-to-Have (Post-MVP)

- **Audio Editor:** Timeline-based drag & drop editor for segment audio (trim, reorder, merge) — similar to the reference screenshot provided
- **YouTube Integration:** Connect YouTube account via Clerk, add dubbed audio to a YouTube video in one click
- **YouTube Dubbing (v1 Reactivation):** Re-enable the YouTube URL dubbing flow once yt-dlp supports SABR

---

## 13. Open Decisions

- **Background jobs:** Railway worker service (decided)
- **Email notifications:** To be handled last; service not yet selected (Resend recommended for easy Next.js integration)
- **In-app notifications:** Small auto-dismissing toast (5–10 seconds), top-right corner — no browser push notifications
- **Stripe migration:** Not required; no active subscribers on existing plans
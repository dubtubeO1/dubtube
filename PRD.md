# DubTube – Project Requirements Document (PRD)

---

## 1. Quick Description

DubTube is a web application that enables users to translate YouTube videos into their desired language while maintaining audio synchronization. Users submit a YouTube link and select a target language; the app extracts the audio, transcribes it, translates the text, generates a new voiceover, and plays the translated audio in sync with the original video. DubTube focuses on a seamless, user-friendly experience with a clean UI and efficient processing.

---

## 2. Video Processing Flow

**Step-by-Step:**
1. User submits a YouTube URL and selects a target language.
2. System checks if the video and translation already exist in cache/database.
   - If yes, fetch and serve cached data.
   - If no, proceed to process the video.
3. Extract audio from the YouTube video using yt-dlp.
4. Transcribe the audio using Whisper API.
5. Translate the transcription using DeepL API.
6. Generate a new voiceover using ElevenLabs API.
7. Store results in cache/database for future requests.
8. Present the user with a player: YouTube video (muted) + translated audio.

---

## 3. Processing Pipeline

**Technical Steps:**
1. **Audio Extraction:**  
   - Use yt-dlp to download audio in MP3 format (128kbps, max 100MB).
2. **Transcription:**  
   - Use Whisper API for speech-to-text with timestamps.
3. **Translation:**  
   - Use DeepL API to translate the transcription into the selected language.
4. **Text-to-Speech:**  
   - Use ElevenLabs API to generate a new audio file in the target language, matching the original timing as closely as possible.
5. **Caching:**  
   - Store transcriptions and translations permanently.
   - Store generated audio for 7 days (to save costs).
   - Use NoSQL (e.g., MongoDB) for video data, SQL (e.g., Supabase) for user/payment data.

---

## 4. User Flow

**Step-by-Step:**
1. **Homepage:**  
   - User sees a simple form: YouTube URL input, language selector, and "Translate" button.
2. **Submission:**  
   - User submits the form.
   - If not logged in, prompt for authentication if limits are exceeded.
3. **Processing:**  
   - Show a real-time progress/loading bar.
   - Backend processes the video as described above.
4. **Result:**  
   - User is shown a page with the embedded YouTube video (muted) and a custom audio player for the translated voiceover.
   - User can play, pause, and seek within the video/audio.
5. **Limits:**  
   - Unauthenticated: 1 video/day, max 5 min.
   - Authenticated: 5 videos/day, max 10 min.
   - Paid: Unlimited.

---

chatgpt features başlangıç

5. Features – AI Implementation Prompts
Each feature below is defined as a module. Subtasks are structured in execution order to guide AI development tools.

✅ 5.1. YouTube Video Translation Module
Goal: Take a YouTube URL and a target language, then return a translated audio stream in sync with the original video.

Steps:

Validate the YouTube URL format and video availability.

Check user authentication and enforce limits by tier.

If cached result exists for (videoId + language), fetch and return it.

If not:

Extract audio using yt-dlp (MP3, 128kbps, ≤100MB).

Transcribe audio using Whisper API with timestamps.

Translate transcript using DeepL API to the selected language.

Generate translated voiceover using ElevenLabs API.

Store results in cache.

Display a progress/loading UI during processing.

Return an embedded (muted) YouTube player and play translated audio via custom player.

🎧 5.2. Audio Synchronization Engine
Goal: Match the translated audio timing to the original video.

Steps:

Use Whisper timestamps to determine phrase-level timing.

Generate translated voiceover using ElevenLabs with:

Similar pause and pacing patterns.

Time-stretching or silence-padding if necessary.

Ensure audio seek is synchronized with YouTube player.

Implement fallback: if syncing fails, offer a “desync warning” notice.

💾 5.3. Caching & Storage Layer
Goal: Minimize redundant processing and API costs.

Steps:

On translation request, check if:

Transcription already exists.

Translation exists in target language.

Audio is still stored (within 7-day retention window).

Store:

Transcriptions and translations permanently in NoSQL (e.g., MongoDB or Supabase KV).

Audio files in object storage (Supabase or S3) with 7-day TTL.

Provide a manual mechanism for cache invalidation (e.g., CLI or admin panel).

Implement lastAccessed field to auto-prune unused data in future.

🙍‍♂️ 5.4. User Authentication & Tier Management
Goal: Manage users, authentication, and usage limits.

Steps:

Set up Clerk for authentication:

Email and OAuth logins.

Session handling.

Design user schema in Supabase SQL:

users: id, email, auth_provider, tier.

payments: user_id, stripe_id, tier, subscription_status.

Integrate Stripe for payments and upgrades.

Enforce usage limits:

Unauthenticated: 1 video/day, max 5 min.

Authenticated: 5 videos/day, max 10 min.

Paid: Unlimited usage.

Show dynamic UI messages when limits are exceeded.

🧼 5.5. Clean & Minimal UI
Goal: Provide a smooth and intuitive user interface.

Steps:

Design a responsive UI with:

Homepage: YouTube URL input + language selector + "Translate" button.

Progress/loading page with real-time feedback.

Result page with:

Embedded YouTube video (muted).

Custom audio player for translated voiceover.

Sync feedback (e.g., play/pause sync).

Use Tailwind CSS or shadcn/ui components for design.

Display clear errors (e.g., "Invalid URL", "Limit reached", "Processing failed").

📈 5.6. Analytics & Monitoring (Future Enhancements)
Goal: Monitor user activity and improve performance.

Steps (optional, can be deferred):

Track user behavior:

Pages visited.

Translation requests per user.

Log API errors and performance metrics.

Build a minimal admin dashboard for analytics and cache control.

chatgpt features bitiş

## 5. Features (with Step-by-Step Explanations)

### 5.1. YouTube Video Translation
- Input: YouTube URL + target language.
- Validation: Check URL validity and video availability.
- Limit enforcement based on user tier.
- Progress bar during processing.
- Result: Embedded video + translated audio.

### 5.2. Audio Synchronization
- Translated audio is generated to match the original video’s timing.
- Maintain speaker pace, pauses, and timestamps.

### 5.3. Caching System
- Check cache before processing to avoid redundant API calls.
- Store transcriptions/translations permanently (NoSQL).
- Store audio files for 7 days (object storage).
- Cache invalidation handled manually if APIs/models are updated.

### 5.4. User Authentication & Tiers
- Use Clerk for authentication.
- Use Supabase SQL for user and payment data.
- Integrate Stripe for paid user management.
- Enforce daily limits and video length based on user tier.

### 5.5. Clean, Minimal UI
- Simple, intuitive forms and progress indicators.
- Responsive design for desktop and mobile.
- Error handling and helpful messages.

### 5.6. Analytics (Future)
- Track usage, errors, and user behavior for future improvements.

---

## 6. Technical Architecture

- **Frontend:** Next.js (React), deployed on Vercel.
- **Backend:** API routes in Next.js or serverless functions.
- **Audio Extraction:** yt-dlp (run in a serverless function or backend server).
- **Transcription:** Whisper API.
- **Translation:** DeepL API.
- **Text-to-Speech:** ElevenLabs API.
- **Authentication:** Clerk.
- **Database:**  
  - NoSQL (MongoDB or Supabase KV) for video/transcription/translation/audio data.
  - SQL (Supabase/Postgres) for user/payment data.
- **Object Storage:** Supabase Storage or S3 for audio files.

---

## 7. Database & Storage Design

### NoSQL (Video Data)
```json
{
  "videoId": "abc123",
  "transcription": { ... },
  "translations": {
    "en": { ... },
    "es": { ... }
  },
  "audio": {
    "en": "url-to-audio-file",
    "es": "url-to-audio-file"
  },
  "createdAt": "...",
  "lastAccessed": "..."
}
```

### SQL (User Data)
- Users table: id, email, auth provider, tier, etc.
- Payments table: user_id, stripe_customer_id, tier, status, etc.

---

## 8. API Endpoints

- `POST /api/translate` – Start translation process.
- `GET /api/status?videoId=...&lang=...` – Check processing status.
- `GET /api/result?videoId=...&lang=...` – Fetch result (transcription, translation, audio URL).
- `POST /api/auth` – User authentication (Clerk).
- `POST /api/payment` – Stripe payment integration.

---

## 9. User Tiers & Payment

- **Unauthenticated:** 1 video/day, max 5 min.
- **Authenticated:** 5 videos/day, max 10 min.
- **Paid:** Unlimited.
- Stripe integration for payment and tier management.

---

## 10. Non-Functional Requirements

- **Performance:** Fast response, efficient caching.
- **Cost:** Minimize API and storage costs.
- **Scalability:** Serverless functions, scalable storage.
- **Security:** Secure API keys, user data, and payment info.
- **Reliability:** Handle API failures gracefully.

---

## 11. Future Enhancements

- User history and favorites.
- Downloadable audio (if cost allows).
- Email notifications.
- Advanced analytics and admin dashboard.
- Branding and design improvements.

---

## Next Steps

1. Set up project repositories and environments.
2. Implement authentication and user tier logic.
3. Build the core processing pipeline and caching.
4. Develop the frontend UI and progress bar.
5. Integrate payment and user management.
6. Test, deploy, and iterate.

---

Let me know if you want this as a markdown file, or if you’d like to expand any section (e.g., database schema, API contract, UI wireframes) in more detail!


- buradan devam

#QUICK DESCRIPTION

DubTube is a web application that enables users to translate YouTube videos into their desired language while maintaining audio synchronization. The application follows a transcribe-translate-synthesize pipeline to ensure high-quality translations, cost efficiency, and caching optimization.

1. Video Processing Flow

graph LR
    A[YouTube URL] --> B[Extract Audio]
    B --> C[Check Cache]
    C --> D{Cached?}
    D -->|Yes| E[Fetch Cached Data]
    D -->|No| F[Process New]

2. Processing Pipeline

graph LR
    A[Audio] --> B[Transcription]
    B --> C[Translation]
    C --> D[Text-to-Speech]
    D --> E[Cache Results]

#CORE FEATURES

## Core Features

### 1. Video Translation
- Users input a YouTube URL
- System validates URL and checks video availability
- Supports videos up to 30 minutes (initial limit)
- Progress bar shows translation status
- Estimated processing time displayed

### 2. Audio Synchronization
- Translated audio synced with original video timing
- Maintains speaker pace and pauses
- Adjustable delay compensation if needed

### 3. Caching System
- Three-tier caching strategy:
  1. Transcriptions (permanent storage)
  2. Translations (permanent storage)
  3. Generated audio (7-day retention for popular languages)
- 24-hour full cache for all new translations
- Cache invalidation on API version updates

## Technical Implementation

### 1. API Integration

#### Audio Extraction
- **Technology:** yt-dlp
- **Implementation:**
  - Extract audio in MP3 format
  - Quality: 128kbps
  - Maximum file size: 100MB

#### Transcription (Whisper API)
- Cost: $0.006/minute
- Language detection
- Timestamp generation
- Format: JSON with time markers

#### Translation (DeepL API)
- Cost: $25/million characters
- Supported languages: 31
- Preserve formatting and punctuation
- Handle special characters

#### Text-to-Speech (ElevenLabs)
- Cost: Starting $22/month
- Voice selection options
- Speech rate adjustment
- Output format: MP3

### 2. Database Schema (Supabase)

#### Videos Table

#DOCUMENTATION

#FILE STRUCTURE
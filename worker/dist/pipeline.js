"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPipeline = runPipeline;
exports.runRemix = runRemix;
exports.runDeliver = runDeliver;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const supabase_1 = require("./lib/supabase");
const r2_1 = require("./lib/r2");
const transcribe_1 = require("./steps/transcribe");
const translate_1 = require("./steps/translate");
const tts_1 = require("./steps/tts");
const mix_audio_1 = require("./steps/mix-audio");
async function setStatus(projectId, status, extra) {
    const supabase = (0, supabase_1.getSupabaseAdmin)();
    await supabase
        .from('projects')
        .update({ status, updated_at: new Date().toISOString(), ...extra })
        .eq('id', projectId);
}
// ── ffprobe duration helper ───────────────────────────────────────────────────
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
async function probeDuration(videoPath) {
    try {
        const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`);
        const parsed = parseFloat(stdout.trim());
        return isNaN(parsed) ? null : parsed;
    }
    catch {
        return null;
    }
}
// ── Main pipeline ─────────────────────────────────────────────────────────────
async function runPipeline(projectId) {
    const supabase = (0, supabase_1.getSupabaseAdmin)();
    let videoPath = null;
    try {
        // ── Fetch project ──────────────────────────────────────────────────────
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id, user_id, title, video_r2_key, source_language, target_language')
            .eq('id', projectId)
            .single();
        if (projectError || !project) {
            throw new Error('Project not found');
        }
        const { video_r2_key, source_language, target_language, user_id } = project;
        if (!video_r2_key)
            throw new Error('Project has no video_r2_key');
        if (!target_language)
            throw new Error('Project has no target_language');
        // Derive clerk_user_id from R2 key prefix (avoids extra DB lookup)
        // Key format: {clerkUserId}/{projectId}/video/{filename}
        const clerkUserId = video_r2_key.split('/')[0];
        if (!clerkUserId)
            throw new Error('Could not derive clerkUserId from video_r2_key');
        // ── Download video ─────────────────────────────────────────────────────
        const ext = path_1.default.extname(video_r2_key.split('/').pop() ?? '') || '.mp4';
        videoPath = path_1.default.join(os_1.default.tmpdir(), `${projectId}_video${ext}`);
        console.log(`[${projectId}] Downloading video from R2...`);
        const videoBuffer = await (0, r2_1.downloadFromR2)(video_r2_key);
        fs_1.default.writeFileSync(videoPath, videoBuffer);
        console.log(`[${projectId}] Video downloaded (${videoBuffer.length} bytes)`);
        // ── Probe duration and store immediately ───────────────────────────────
        const videoDuration = await probeDuration(videoPath);
        if (videoDuration !== null) {
            console.log(`[${projectId}] Video duration: ${videoDuration.toFixed(2)}s`);
            await supabase
                .from('projects')
                .update({ video_duration_seconds: videoDuration, updated_at: new Date().toISOString() })
                .eq('id', projectId);
        }
        // ── Transcribing ───────────────────────────────────────────────────────
        await setStatus(projectId, 'transcribing');
        console.log(`[${projectId}] Transcribing...`);
        const { segments, detectedLanguage } = await (0, transcribe_1.transcribeVideo)(videoPath);
        console.log(`[${projectId}] Transcribed ${segments.length} segments, language: ${detectedLanguage}`);
        // Resolve effective source language (use detected if user chose auto-detect)
        const effectiveSourceLang = source_language ?? detectedLanguage.toUpperCase();
        if (!source_language) {
            await supabase
                .from('projects')
                .update({ source_language: effectiveSourceLang, updated_at: new Date().toISOString() })
                .eq('id', projectId);
        }
        if (segments.length === 0) {
            throw new Error('Transcription returned no segments — the audio may be silent or unrecognisable');
        }
        // ── Translating ────────────────────────────────────────────────────────
        await setStatus(projectId, 'translating');
        console.log(`[${projectId}] Translating ${segments.length} segments...`);
        const texts = segments.map((s) => s.text);
        const translatedTexts = await (0, translate_1.translateSegments)(texts, effectiveSourceLang, target_language);
        // ── Generating audio ───────────────────────────────────────────────────
        await setStatus(projectId, 'generating_audio');
        console.log(`[${projectId}] Generating TTS for ${segments.length} segments...`);
        // Build speaker rows — one per unique speaker label returned by diarization.
        // Preserves insertion order so SPEAKER_00 is always the first speaker.
        const uniqueSpeakerIds = [
            ...new Set(segments.map((s) => s.speaker ?? 'SPEAKER_00')),
        ];
        const speakerRows = uniqueSpeakerIds.map((speakerId) => ({
            project_id: projectId,
            speaker_id: speakerId,
            speaker_name: speakerId, // default display name — user can rename in editor
            voice_id: '21m00Tcm4TlvDq8ikWAM',
            is_cloned: false,
        }));
        const { error: speakersInsertError } = await supabase
            .from('speakers')
            .insert(speakerRows);
        if (speakersInsertError) {
            throw new Error(`Failed to insert speakers: ${speakersInsertError.message}`);
        }
        console.log(`[${projectId}] Created ${uniqueSpeakerIds.length} speaker(s): ${uniqueSpeakerIds.join(', ')}`);
        // Generate TTS per segment and collect transcript rows
        const transcriptRows = [];
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const translatedText = translatedTexts[i] ?? '';
            const speakerId = segment.speaker ?? 'SPEAKER_00';
            console.log(`[${projectId}] TTS segment ${i + 1}/${segments.length}`);
            const { r2Key, voiceId } = await (0, tts_1.generateSegmentAudio)(translatedText, i, projectId, clerkUserId);
            transcriptRows.push({
                project_id: projectId,
                speaker_id: speakerId,
                speaker_name: speakerId,
                start_time: segment.start,
                end_time: segment.end,
                original_text: segment.text,
                translated_text: translatedText,
                segment_audio_r2_key: r2Key,
                voice_id: voiceId,
                is_cloned: false,
                duration_match: true,
            });
        }
        // Batch insert all transcript rows
        const { error: insertError } = await supabase.from('transcripts').insert(transcriptRows);
        if (insertError) {
            throw new Error(`Failed to insert transcripts: ${insertError.message}`);
        }
        // ── Complete ───────────────────────────────────────────────────────────
        await setStatus(projectId, 'completed');
        console.log(`[${projectId}] Pipeline complete`);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[${projectId}] Pipeline failed:`, message);
        try {
            await setStatus(projectId, 'error', { error_message: message });
        }
        catch (updateErr) {
            console.error(`[${projectId}] Failed to write error status:`, updateErr);
        }
    }
    finally {
        if (videoPath && fs_1.default.existsSync(videoPath)) {
            try {
                fs_1.default.unlinkSync(videoPath);
            }
            catch { /* ignore */ }
        }
    }
}
// ── Remix pipeline (reorder segments, sequential concatenation) ───────────────
async function runRemix(projectId, segmentOrder) {
    const supabase = (0, supabase_1.getSupabaseAdmin)();
    try {
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id, video_r2_key')
            .eq('id', projectId)
            .single();
        if (projectError || !project)
            throw new Error('Project not found');
        const { video_r2_key } = project;
        if (!video_r2_key)
            throw new Error('Project has no video_r2_key');
        const clerkUserId = video_r2_key.split('/')[0];
        if (!clerkUserId)
            throw new Error('Could not derive clerkUserId from video_r2_key');
        // Fetch only the requested transcripts
        const { data: transcripts, error: transcriptsError } = await supabase
            .from('transcripts')
            .select('id, segment_audio_r2_key')
            .in('id', segmentOrder)
            .eq('project_id', projectId);
        if (transcriptsError || !transcripts)
            throw new Error('Failed to fetch transcripts');
        // Build a map so we can reorder by the user-specified sequence
        const transcriptMap = new Map(transcripts.map((t) => [
            t.id,
            t,
        ]));
        const orderedSegments = segmentOrder
            .map((id) => transcriptMap.get(id))
            .filter((s) => s != null && typeof s.segment_audio_r2_key === 'string');
        if (orderedSegments.length === 0)
            throw new Error('No segments with audio found');
        console.log(`[${projectId}] Remixing ${orderedSegments.length} segment(s) in custom order...`);
        const dubbedR2Key = await (0, mix_audio_1.concatDubbedAudio)(orderedSegments, projectId, clerkUserId);
        await supabase
            .from('projects')
            .update({
            status: 'delivered',
            dubbed_audio_r2_key: dubbedR2Key,
            updated_at: new Date().toISOString(),
        })
            .eq('id', projectId);
        console.log(`[${projectId}] Remix complete — r2Key: ${dubbedR2Key}`);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[${projectId}] Remix failed:`, message);
        try {
            await supabase
                .from('projects')
                .update({ status: 'error', error_message: message, updated_at: new Date().toISOString() })
                .eq('id', projectId);
        }
        catch (updateErr) {
            console.error(`[${projectId}] Failed to write error status:`, updateErr);
        }
    }
}
// ── Deliver pipeline ──────────────────────────────────────────────────────────
async function runDeliver(projectId) {
    const supabase = (0, supabase_1.getSupabaseAdmin)();
    try {
        // ── Fetch project + transcripts ────────────────────────────────────────
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id, video_r2_key, video_duration_seconds')
            .eq('id', projectId)
            .single();
        if (projectError || !project) {
            throw new Error('Project not found');
        }
        const { video_r2_key, video_duration_seconds } = project;
        if (!video_r2_key)
            throw new Error('Project has no video_r2_key');
        const clerkUserId = video_r2_key.split('/')[0];
        if (!clerkUserId)
            throw new Error('Could not derive clerkUserId from video_r2_key');
        const { data: transcripts, error: transcriptsError } = await supabase
            .from('transcripts')
            .select('id, start_time, end_time, segment_audio_r2_key, duration_match')
            .eq('project_id', projectId)
            .order('start_time', { ascending: true });
        if (transcriptsError || !transcripts) {
            throw new Error('Failed to fetch transcripts');
        }
        const segments = transcripts;
        console.log(`[${projectId}] Mixing ${segments.length} segment(s)...`);
        // ── Mix dubbed audio ───────────────────────────────────────────────────
        const dubbedR2Key = await (0, mix_audio_1.mixDubbedAudio)(segments, video_duration_seconds, projectId, clerkUserId);
        // ── Mark delivered ─────────────────────────────────────────────────────
        await supabase
            .from('projects')
            .update({
            status: 'delivered',
            dubbed_audio_r2_key: dubbedR2Key,
            updated_at: new Date().toISOString(),
        })
            .eq('id', projectId);
        console.log(`[${projectId}] Deliver complete — r2Key: ${dubbedR2Key}`);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[${projectId}] Deliver failed:`, message);
        try {
            await supabase
                .from('projects')
                .update({
                status: 'error',
                error_message: message,
                updated_at: new Date().toISOString(),
            })
                .eq('id', projectId);
        }
        catch (updateErr) {
            console.error(`[${projectId}] Failed to write error status:`, updateErr);
        }
    }
}

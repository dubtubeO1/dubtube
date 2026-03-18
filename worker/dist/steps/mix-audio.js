"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mixDubbedAudio = mixDubbedAudio;
exports.concatDubbedAudio = concatDubbedAudio;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const r2_1 = require("../lib/r2");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * Mix all dubbed segment audio files into a single audio track.
 *
 * Strategy:
 *  1. Build a silent base track of total video duration.
 *  2. For each segment with a valid audio key:
 *     - If duration_match=true: apply atempo to stretch/compress the clip
 *       to exactly fill [start_time, end_time].
 *     - Place the (optionally time-adjusted) clip at start_time using adelay.
 *  3. amix all inputs (silent base + delayed clips) into a single stereo track.
 *  4. Upload the result to R2 and return the key.
 */
async function mixDubbedAudio(segments, videoDurationSeconds, projectId, clerkUserId) {
    const workDir = path_1.default.join(os_1.default.tmpdir(), `mix_${projectId}`);
    fs_1.default.mkdirSync(workDir, { recursive: true });
    try {
        // Download all segment audio files in parallel
        const segmentFiles = [];
        await Promise.all(segments.map(async (seg, i) => {
            if (!seg.segment_audio_r2_key)
                return;
            const localPath = path_1.default.join(workDir, `seg_${i}.mp3`);
            const buf = await (0, r2_1.downloadFromR2)(seg.segment_audio_r2_key);
            fs_1.default.writeFileSync(localPath, buf);
            segmentFiles[i] = localPath;
        }));
        // Determine total duration for the silent base track.
        // Fall back to the end_time of the last segment + 1 second if not probed.
        let totalDuration = videoDurationSeconds;
        if (!totalDuration || totalDuration <= 0) {
            const lastEnd = Math.max(...segments.map((s) => (s.end_time ?? 0)), 0);
            totalDuration = lastEnd + 1;
        }
        // Build silent base track
        const silencePath = path_1.default.join(workDir, 'silence.mp3');
        await execAsync(`ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t ${totalDuration} "${silencePath}"`);
        // Build ffmpeg filter_complex input list and filter graph
        // Input 0 is always the silence base; inputs 1..N are the segment clips.
        const inputArgs = [`-i "${silencePath}"`];
        const filterParts = [];
        const mixInputs = ['[0:a]'];
        let inputIndex = 1;
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const localFile = segmentFiles[i];
            if (!localFile || seg.start_time === null)
                continue;
            const delayMs = Math.round(seg.start_time * 1000);
            inputArgs.push(`-i "${localFile}"`);
            if (seg.duration_match && seg.end_time !== null && seg.end_time > seg.start_time) {
                // Probe actual audio duration to calculate the atempo ratio
                let clipDuration = null;
                try {
                    const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${localFile}"`);
                    clipDuration = parseFloat(stdout.trim());
                    if (isNaN(clipDuration))
                        clipDuration = null;
                }
                catch {
                    clipDuration = null;
                }
                if (clipDuration && clipDuration > 0) {
                    const targetDuration = seg.end_time - seg.start_time;
                    let ratio = clipDuration / targetDuration;
                    // atempo only accepts values in [0.5, 100.0].
                    // Chain multiple atempo filters if needed.
                    const atempoFilters = buildAtempoChain(ratio);
                    filterParts.push(`[${inputIndex}:a]${atempoFilters},adelay=${delayMs}|${delayMs}[a${inputIndex}]`);
                }
                else {
                    filterParts.push(`[${inputIndex}:a]adelay=${delayMs}|${delayMs}[a${inputIndex}]`);
                }
            }
            else {
                filterParts.push(`[${inputIndex}:a]adelay=${delayMs}|${delayMs}[a${inputIndex}]`);
            }
            mixInputs.push(`[a${inputIndex}]`);
            inputIndex++;
        }
        const outputPath = path_1.default.join(workDir, 'dubbed.mp3');
        if (mixInputs.length === 1) {
            // No valid segments — output just the silence track
            await execAsync(`ffmpeg -y -i "${silencePath}" -c:a libmp3lame -b:a 128k "${outputPath}"`);
        }
        else {
            const filterComplex = filterParts.join(';') +
                (filterParts.length > 0 ? ';' : '') +
                `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0[aout]`;
            const inputStr = inputArgs.join(' ');
            await execAsync(`ffmpeg -y ${inputStr} -filter_complex "${filterComplex}" -map "[aout]" -c:a libmp3lame -b:a 128k "${outputPath}"`);
        }
        // Upload to R2
        const r2Key = `${clerkUserId}/${projectId}/dubbed/dubbed_audio.mp3`;
        const outputBuf = fs_1.default.readFileSync(outputPath);
        await (0, r2_1.uploadToR2)(r2Key, outputBuf, 'audio/mpeg');
        return r2Key;
    }
    finally {
        // Clean up temp dir
        try {
            fs_1.default.rmSync(workDir, { recursive: true, force: true });
        }
        catch { /* ignore */ }
    }
}
/**
 * Concatenate dubbed segment audio files sequentially in the given order.
 * Unlike mixDubbedAudio (which positions clips at their original timestamps),
 * this produces a linear audio track with no gaps.
 */
async function concatDubbedAudio(segments, projectId, clerkUserId) {
    const workDir = path_1.default.join(os_1.default.tmpdir(), `concat_${projectId}`);
    fs_1.default.mkdirSync(workDir, { recursive: true });
    try {
        // Download all segment files in order
        const segmentFiles = [];
        await Promise.all(segments.map(async (seg, i) => {
            const localPath = path_1.default.join(workDir, `seg_${i}.mp3`);
            const buf = await (0, r2_1.downloadFromR2)(seg.segment_audio_r2_key);
            fs_1.default.writeFileSync(localPath, buf);
            segmentFiles[i] = localPath;
        }));
        const validFiles = segmentFiles.filter(Boolean);
        if (validFiles.length === 0)
            throw new Error('No valid segment files to concatenate');
        const outputPath = path_1.default.join(workDir, 'remixed.mp3');
        if (validFiles.length === 1) {
            // Single file — just re-encode it
            await execAsync(`ffmpeg -y -i "${validFiles[0]}" -c:a libmp3lame -b:a 128k "${outputPath}"`);
        }
        else {
            // Write concat list and use ffmpeg concat demuxer
            const concatListPath = path_1.default.join(workDir, 'concat.txt');
            const concatList = validFiles.map((f) => `file '${f}'`).join('\n');
            fs_1.default.writeFileSync(concatListPath, concatList);
            await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c:a libmp3lame -b:a 128k "${outputPath}"`);
        }
        const r2Key = `${clerkUserId}/${projectId}/dubbed/dubbed_audio.mp3`;
        const outputBuf = fs_1.default.readFileSync(outputPath);
        await (0, r2_1.uploadToR2)(r2Key, outputBuf, 'audio/mpeg');
        return r2Key;
    }
    finally {
        try {
            fs_1.default.rmSync(workDir, { recursive: true, force: true });
        }
        catch { /* ignore */ }
    }
}
/**
 * Build a chain of atempo filters to achieve a target ratio.
 * atempo only accepts [0.5, 100.0]; chain filters for extreme values.
 */
function buildAtempoChain(ratio) {
    // Clamp to a reasonable range to avoid extreme stretching
    const clamped = Math.max(0.25, Math.min(4.0, ratio));
    if (clamped >= 0.5 && clamped <= 2.0) {
        return `atempo=${clamped.toFixed(4)}`;
    }
    if (clamped < 0.5) {
        // e.g. ratio=0.25 → atempo=0.5,atempo=0.5
        return `atempo=0.5,atempo=${(clamped / 0.5).toFixed(4)}`;
    }
    // clamped > 2.0, e.g. ratio=3.0 → atempo=2.0,atempo=1.5
    return `atempo=2.0,atempo=${(clamped / 2.0).toFixed(4)}`;
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transcribeVideo = transcribeVideo;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
async function transcribeVideo(videoPath) {
    const apiKey = process.env.LEMONFOX_API_KEY;
    if (!apiKey)
        throw new Error('Missing LEMONFOX_API_KEY');
    // Extract audio: stereo, 22kHz, 128kbps MP3.
    // Keep stereo and higher quality so the diarization model retains enough acoustic
    // information to distinguish speakers. Mono/16kHz/64kbps strips features that
    // pitch + timbre-based speaker separation depends on.
    const audioPath = path_1.default.join(os_1.default.tmpdir(), `${path_1.default.basename(videoPath, path_1.default.extname(videoPath))}_audio.mp3`);
    try {
        await execAsync(`ffmpeg -y -i "${videoPath}" -vn -acodec libmp3lame -ar 22050 -ac 2 -b:a 128k "${audioPath}"`);
        const audioBuffer = fs_1.default.readFileSync(audioPath);
        const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.mp3');
        // Do NOT specify model: Lemonfox routes through their diarization-enabled
        // pipeline by default. Explicitly setting 'whisper-1' hits the base
        // OpenAI-compatible endpoint that skips speaker separation.
        formData.append('response_format', 'verbose_json');
        formData.append('timestamp_granularities[]', 'word');
        formData.append('speaker_labels', 'true');
        const response = await fetch('https://api.lemonfox.ai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}` },
            body: formData,
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Lemonfox API error ${response.status}: ${errText}`);
        }
        const data = (await response.json());
        const segments = data.segments
            .map((s) => ({
            start: s.start,
            end: s.end,
            text: s.text.trim(),
            speaker: s.speaker ?? null,
        }))
            .filter((s) => s.text.length > 0);
        return { segments, detectedLanguage: data.language };
    }
    finally {
        if (fs_1.default.existsSync(audioPath)) {
            try {
                fs_1.default.unlinkSync(audioPath);
            }
            catch { /* ignore */ }
        }
    }
}

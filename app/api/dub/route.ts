import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { cleanupAudioFolders } from '@/app/utils/cleanup';

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  speaker: string;
  translation?: string;
}

const DEFAULT_VOICES = [
  'EXAVITQu4vr4xnSDxMaL', // Rachel
  'ErXwobaYiN019PkySvjV', // Domi
  'MF3mGyEYCl7XYWbV9V6O', // Bella
  'TxGEqnHWrfWFTfGW9XjX', // Antoni
  'VR6AewLTigWG4xSOukaG', // Elli
  'pNInz6obpgDQGcFmaJgB', // Josh
  'yoZ06aMxZJJ28mfd3POQ', // Arnold
];

// Ensure paths that come from the client like "/audio/xyz.mp3" are resolved under public/
function resolvePublicPath(maybePublicSubpath: string): string {
  const withoutLeadingSlash = maybePublicSubpath.startsWith('/')
    ? maybePublicSubpath.slice(1)
    : maybePublicSubpath;
  return path.join(process.cwd(), 'public', withoutLeadingSlash);
}

async function extractAndConcatSegments(audioPath: string, segments: TranscriptionSegment[], speakerId: string): Promise<string> {
  // Ensure the temp directory exists
  const tempDir = path.join(process.cwd(), 'public', 'audio', 'temp');
  await mkdir(tempDir, { recursive: true });

  // Extract each segment to a temp file
  const segmentFiles: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segFile = path.join(tempDir, `${speakerId}_seg${i}_${uuidv4()}.mp3`);
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-i', resolvePublicPath(audioPath),
        '-ss', seg.start.toString(),
        '-to', seg.end.toString(),
        '-c', 'copy',
        segFile
      ]);
      ffmpeg.on('close', (code) => {
        if (code === 0) resolve(null);
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
      ffmpeg.on('error', reject);
    });
    segmentFiles.push(segFile);
  }

  // Create a file list for ffmpeg concat
  const concatListPath = path.join(tempDir, `${speakerId}_concat_list.txt`);
  const concatListContent = segmentFiles.map(f => `file '${f}'`).join('\n');
  await writeFile(concatListPath, concatListContent);

  // Output file
  const outputFile = path.join(process.cwd(), 'public', 'audio', `${speakerId}_cloning_${uuidv4()}.mp3`);
  await new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      outputFile
    ]);
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve(null);
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    ffmpeg.on('error', reject);
  });

  return outputFile;
}

async function cloneVoiceWithElevenLabs(audioFilePath: string, speakerId: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('Missing ELEVENLABS_API_KEY');

  // Prepare form data
  const formData = new FormData();
  formData.append('name', `DubTube Speaker ${speakerId}`);
  formData.append('files', new Blob([fs.readFileSync(audioFilePath)]), `${speakerId}_cloning.mp3`);

  const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Voice cloning failed');
  }
  const data = await response.json();
  return data.voice_id;
}

async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    console.log('Getting audio duration for file:', filePath);
    
    // Check if file exists first
    fs.promises.access(filePath).then(() => {
      console.log('File exists, running ffprobe');
    }).catch((err) => {
      console.error('File does not exist:', filePath, err);
      reject(new Error(`File does not exist: ${filePath}`));
      return;
    });
    
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ]);
    
    let output = '';
    let errorOutput = '';
    
    // Add timeout
    const timeout = setTimeout(() => {
      ffprobe.kill();
      reject(new Error('ffprobe timeout after 10 seconds'));
    }, 10000);
    
    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    ffprobe.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    ffprobe.on('close', (code) => {
      clearTimeout(timeout);
      console.log('ffprobe exited with code:', code);
      if (errorOutput) console.log('ffprobe error output:', errorOutput);
      
      if (code === 0) {
        const duration = parseFloat(output.trim());
        console.log('Audio duration:', duration, 'seconds');
        resolve(duration);
      } else {
        reject(new Error(`Failed to get audio duration. Code: ${code}, Error: ${errorOutput}`));
      }
    });
    
    ffprobe.on('error', (error) => {
      clearTimeout(timeout);
      console.error('ffprobe process error:', error);
      reject(error);
    });
  });
}

async function adjustAudioDuration(inputFile: string, targetDuration: number, outputFile: string): Promise<void> {
  // Get current duration
  const currentDuration = await getAudioDuration(inputFile);
  if (Math.abs(currentDuration - targetDuration) < 0.05) {
    // Already close enough, just copy
    await writeFile(outputFile, await fs.promises.readFile(inputFile));
    return;
  }
  if (currentDuration < targetDuration) {
    // Pad with silence
    const padDuration = targetDuration - currentDuration;
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-i', inputFile,
        '-f', 'lavfi',
        '-t', padDuration.toString(),
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1',
        '-c:a', 'mp3',
        outputFile
      ]);
      ffmpeg.on('close', (code) => {
        if (code === 0) resolve(null);
        else reject(new Error(`ffmpeg pad exited with code ${code}`));
      });
      ffmpeg.on('error', reject);
    });
  } else {
    // Time-stretch (speed up)
    const atempo = Math.max(0.5, Math.min(2.0, currentDuration / targetDuration));
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-i', inputFile,
        '-filter:a', `atempo=${atempo}`,
        '-c:a', 'mp3',
        outputFile
      ]);
      ffmpeg.on('close', (code) => {
        if (code === 0) resolve(null);
        else reject(new Error(`ffmpeg atempo exited with code ${code}`));
      });
      ffmpeg.on('error', reject);
    });
  }
}

async function generateTTSWithElevenLabs(text: string, voiceId: string, language: string, segmentIndex: number, speakerId: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('Missing ELEVENLABS_API_KEY');

  // Prepare output file path
  const outputDir = path.join(process.cwd(), 'public', 'audio', 'tts');
  await mkdir(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, `${speakerId}_seg${segmentIndex}_${uuidv4()}.mp3`);

  // Call ElevenLabs TTS API
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      output_format: 'mp3_44100_128',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'TTS generation failed');
  }
  const arrayBuffer = await response.arrayBuffer();
  await writeFile(outputFile, Buffer.from(arrayBuffer));
  return outputFile;
}

export async function POST(request: Request) {
  try {
    const { transcription, translatedTranscription, audioPath } = await request.json();
    if (!transcription || !translatedTranscription || !audioPath) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // 1. Analyze speakers and sum durations
    const speakerDurations: Record<string, number> = {};
    const speakerSegments: Record<string, TranscriptionSegment[]> = {};
    for (const segment of transcription) {
      const duration = segment.end - segment.start;
      speakerDurations[segment.speaker] = (speakerDurations[segment.speaker] || 0) + duration;
      if (!speakerSegments[segment.speaker]) speakerSegments[segment.speaker] = [];
      speakerSegments[segment.speaker].push(segment);
    }

    // 2. Assign voices
    const speakerVoices: Record<string, { type: 'clone' | 'default', voiceId: string, duration: number, audioForCloning?: string }> = {};
    let defaultVoiceIndex = 0;
    for (const speakerId in speakerDurations) {
      if (speakerDurations[speakerId] >= 60) {
        // Prepare audio for cloning: concatenate segments up to 1 minute
        let total = 0;
        const selectedSegments: TranscriptionSegment[] = [];
        for (const seg of speakerSegments[speakerId]) {
          if (total >= 60) break;
          const segDuration = seg.end - seg.start;
          selectedSegments.push(seg);
          total += segDuration;
        }
        const audioForCloning = await extractAndConcatSegments(audioPath, selectedSegments, speakerId);
        // Call ElevenLabs API to clone the voice
        let voiceId = '';
        try {
          voiceId = await cloneVoiceWithElevenLabs(audioForCloning, speakerId);
        } catch (err) {
          console.error(`Voice cloning failed for speaker ${speakerId}:`, err);
        }
        speakerVoices[speakerId] = { type: 'clone', voiceId, duration: speakerDurations[speakerId], audioForCloning };
      } else {
        // Assign a default voice
        speakerVoices[speakerId] = {
          type: 'default',
          voiceId: DEFAULT_VOICES[defaultVoiceIndex % DEFAULT_VOICES.length],
          duration: speakerDurations[speakerId],
        };
        defaultVoiceIndex++;
      }
    }

    // 4. Generate TTS audio for each translated segment
    const ttsSegmentFiles: string[] = [];
    for (let i = 0; i < translatedTranscription.length; i++) {
      const segment = translatedTranscription[i];
      const speakerId = segment.speaker;
      const voiceId = speakerVoices[speakerId]?.voiceId;
      if (!voiceId) continue; // skip if no voice assigned
      try {
        const ttsFile = await generateTTSWithElevenLabs(segment.translation || segment.text, voiceId, 'auto', i, speakerId);
        // Adjust duration to match original segment
        const originalSegment = transcription[i];
        const targetDuration = originalSegment.end - originalSegment.start;
        const adjustedFile = ttsFile.replace(/\.mp3$/, '_adjusted.mp3');
        await adjustAudioDuration(ttsFile, targetDuration, adjustedFile);
        ttsSegmentFiles.push(adjustedFile);
      } catch (err) {
        console.error(`TTS generation or adjustment failed for segment ${i} (speaker ${speakerId}):`, err);
      }
    }

    // 5. Concatenate all TTS audio segments into a final dubbed audio file
    const concatListPath = path.join(process.cwd(), 'public', 'audio', 'tts_concat_list.txt');
    const concatListContent = ttsSegmentFiles.map(f => `file '${f}'`).join('\n');
    await writeFile(concatListPath, concatListContent);
    const dubbedAudioFile = path.join(process.cwd(), 'public', 'audio', `dubbed_final_${uuidv4()}.mp3`);
    
    console.log('Creating final dubbed audio file:', dubbedAudioFile);
    console.log('TTS segment files count:', ttsSegmentFiles.length);
    console.log('Concat list content:', concatListContent);
    
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c', 'copy',
        dubbedAudioFile
      ]);
      
      let ffmpegOutput = '';
      let ffmpegError = '';
      
      ffmpeg.stdout.on('data', (data) => {
        ffmpegOutput += data.toString();
      });
      
      ffmpeg.stderr.on('data', (data) => {
        ffmpegError += data.toString();
      });
      
      ffmpeg.on('close', (code) => {
        console.log('FFmpeg concatenation process exited with code:', code);
        if (ffmpegOutput) console.log('FFmpeg output:', ffmpegOutput);
        if (ffmpegError) console.log('FFmpeg error:', ffmpegError);
        
        if (code === 0) {
          console.log('FFmpeg concatenation successful');
          resolve(null);
        } else {
          console.error('FFmpeg concatenation failed with code:', code);
          reject(new Error(`ffmpeg exited with code ${code}`));
        }
      });
      ffmpeg.on('error', (error) => {
        console.error('FFmpeg process error:', error);
        reject(error);
      });
    });

    console.log('Concatenation completed, checking final file...');
    
    // Check if the concatenated file exists
    try {
      const stats = await fs.promises.stat(dubbedAudioFile);
      console.log('Concatenated file exists, size:', stats.size, 'bytes');
    } catch (err) {
      console.error('Concatenated file does not exist:', dubbedAudioFile, err);
      throw new Error('Concatenated audio file was not created');
    }

    // 5.5. Final adjustment: pad or trim to match original audio length
    console.log('Starting final adjustment...');
    const originalAudioPath = resolvePublicPath(audioPath);
    console.log('Original audio path:', originalAudioPath);
    console.log('Dubbed audio path:', dubbedAudioFile);
    
    const originalDuration = await getAudioDuration(originalAudioPath);
    const dubbedDuration = await getAudioDuration(dubbedAudioFile);
    console.log('Original audio duration:', originalDuration, 'seconds');
    console.log('Dubbed audio duration:', dubbedDuration, 'seconds');
    console.log('Duration difference:', Math.abs(dubbedDuration - originalDuration), 'seconds');
    
    if (Math.abs(dubbedDuration - originalDuration) > 0.01) {
      const adjustedDubbedFile = dubbedAudioFile.replace(/\.mp3$/, '_final.mp3');
      if (dubbedDuration < originalDuration) {
        // Pad with silence
        const padDuration = originalDuration - dubbedDuration;
        console.log('Padding audio with', padDuration, 'seconds of silence');
        await new Promise((resolve, reject) => {
          const ffmpeg = spawn('ffmpeg', [
            '-y',
            '-i', dubbedAudioFile,
            '-f', 'lavfi',
            '-t', padDuration.toString(),
            '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
            '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1',
            '-c:a', 'mp3',
            adjustedDubbedFile
          ]);
          
          let ffmpegOutput = '';
          let ffmpegError = '';
          
          ffmpeg.stdout.on('data', (data) => {
            ffmpegOutput += data.toString();
          });
          
          ffmpeg.stderr.on('data', (data) => {
            ffmpegError += data.toString();
          });
          
          ffmpeg.on('close', (code) => {
            console.log('FFmpeg pad (final) process exited with code:', code);
            if (ffmpegOutput) console.log('FFmpeg pad output:', ffmpegOutput);
            if (ffmpegError) console.log('FFmpeg pad error:', ffmpegError);
            
            if (code === 0) {
              console.log('FFmpeg pad (final) successful');
              resolve(null);
            } else {
              console.error('FFmpeg pad (final) failed with code:', code);
              reject(new Error(`ffmpeg pad (final) exited with code ${code}`));
            }
          });
          ffmpeg.on('error', (error) => {
            console.error('FFmpeg pad (final) process error:', error);
            reject(error);
          });
        });
      } else {
        // Trim to match
        console.log('Trimming audio to', originalDuration, 'seconds');
        await new Promise((resolve, reject) => {
          const ffmpeg = spawn('ffmpeg', [
            '-y',
            '-i', dubbedAudioFile,
            '-t', originalDuration.toString(),
            '-c:a', 'mp3',
            adjustedDubbedFile
          ]);
          
          let ffmpegOutput = '';
          let ffmpegError = '';
          
          ffmpeg.stdout.on('data', (data) => {
            ffmpegOutput += data.toString();
          });
          
          ffmpeg.stderr.on('data', (data) => {
            ffmpegError += data.toString();
          });
          
          ffmpeg.on('close', (code) => {
            console.log('FFmpeg trim (final) process exited with code:', code);
            if (ffmpegOutput) console.log('FFmpeg trim output:', ffmpegOutput);
            if (ffmpegError) console.log('FFmpeg trim error:', ffmpegError);
            
            if (code === 0) {
              console.log('FFmpeg trim (final) successful');
              resolve(null);
            } else {
              console.error('FFmpeg trim (final) failed with code:', code);
              reject(new Error(`ffmpeg trim (final) exited with code ${code}`));
            }
          });
          ffmpeg.on('error', (error) => {
            console.error('FFmpeg trim (final) process error:', error);
            reject(error);
          });
        });
      }
      // Use the adjusted file for the response
      const finalAdjustedUrl = adjustedDubbedFile.replace(process.cwd() + '/public', '');
      console.log('Final adjusted audio URL being returned:', finalAdjustedUrl);
      console.log('Full adjusted audio file path:', adjustedDubbedFile);
      
      // Check if the file actually exists
      try {
        const stats = await fs.promises.stat(adjustedDubbedFile);
        console.log('Adjusted audio file exists, size:', stats.size, 'bytes');
      } catch (err) {
        console.error('Adjusted audio file does not exist:', err);
      }
      
      // Serve via streaming endpoint to ensure Range support
      const finalBasename = path.basename(adjustedDubbedFile);
      const streamUrl = `/api/serve-audio?f=${encodeURIComponent(finalBasename)}`;
      return NextResponse.json({
        speakerDurations,
        speakerVoices,
        speakerSegments,
        dubbedAudioUrl: streamUrl,
        message: 'Dubbed audio generation complete and final adjustment applied.'
      });
    }

    // After all processing is complete, run cleanup
    await cleanupAudioFolders();

    // If no adjustment was needed, return the original dubbed file
    const finalBasename = path.basename(dubbedAudioFile);
    const finalAudioUrl = `/api/serve-audio?f=${encodeURIComponent(finalBasename)}`;
    console.log('Final audio stream URL being returned:', finalAudioUrl);
    console.log('Full dubbed audio file path:', dubbedAudioFile);
    
    // Check if the file actually exists
    try {
      const stats = await fs.promises.stat(dubbedAudioFile);
      console.log('Dubbed audio file exists, size:', stats.size, 'bytes');
    } catch (err) {
      console.error('Dubbed audio file does not exist:', err);
    }
    
    return NextResponse.json({
      speakerDurations,
      speakerVoices,
      speakerSegments,
      dubbedAudioUrl: finalAudioUrl,
      message: 'Dubbed audio generation complete (no final adjustment needed).'
    });
  } catch (error) {
    console.error('Error in dubbing route:', error);
    return NextResponse.json({ error: 'Failed to process dubbing request' }, { status: 500 });
  }
} 
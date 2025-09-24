import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Stream audio from public/audio with Range support
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fileParam = searchParams.get('f');
    if (!fileParam) {
      return NextResponse.json({ error: 'Missing file parameter' }, { status: 400 });
    }

    // Security: only allow basenames under public/audio
    const filename = path.basename(fileParam);
    const filePath = path.join(process.cwd(), 'public', 'audio', filename);

    // Check existence and size
    const stat = await fs.promises.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const range = request.headers.get('range');
    const fileSize = stat.size;

    // No range: stream entire file
    if (!range) {
      const stream = fs.createReadStream(filePath);
      return new NextResponse(stream as any, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // Parse Range: bytes=start-end
    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (!match) {
      return NextResponse.json({ error: 'Invalid Range header' }, { status: 416 });
    }
    const start = parseInt(match[1], 10);
    const end = match[2] ? Math.min(parseInt(match[2], 10), fileSize - 1) : fileSize - 1;
    if (isNaN(start) || isNaN(end) || start > end || start >= fileSize) {
      return NextResponse.json({ error: 'Invalid Range values' }, { status: 416 });
    }

    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });
    return new NextResponse(stream as any, {
      status: 206,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(chunkSize),
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error serving audio:', error);
    return NextResponse.json({ error: 'Failed to serve audio' }, { status: 500 });
  }
}



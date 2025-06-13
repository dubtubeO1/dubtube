import fs from 'fs';
import path from 'path';

const MAX_FOLDER_SIZE = 1024 * 1024 * 1024; // 1GB in bytes
const AUDIO_DIR = path.join(process.cwd(), 'public', 'audio');

interface FileInfo {
  path: string;
  size: number;
  mtime: Date;
}

async function getFolderSize(folderPath: string): Promise<number> {
  const files = await fs.promises.readdir(folderPath);
  let totalSize = 0;
  
  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const stats = await fs.promises.stat(filePath);
    if (stats.isFile()) {
      totalSize += stats.size;
    }
  }
  
  return totalSize;
}

async function getFilesByDate(folderPath: string): Promise<FileInfo[]> {
  const files = await fs.promises.readdir(folderPath);
  const fileInfos: FileInfo[] = [];
  
  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const stats = await fs.promises.stat(filePath);
    if (stats.isFile()) {
      fileInfos.push({
        path: filePath,
        size: stats.size,
        mtime: stats.mtime
      });
    }
  }
  
  // Sort by modification time (oldest first)
  return fileInfos.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
}

async function cleanupFolder(folderPath: string): Promise<void> {
  try {
    // Check if folder exists
    await fs.promises.access(folderPath);
    
    // Get current folder size
    const currentSize = await getFolderSize(folderPath);
    
    // If folder size is under limit, no cleanup needed
    if (currentSize < MAX_FOLDER_SIZE) {
      console.log(`Folder ${folderPath} size (${currentSize} bytes) is under limit`);
      return;
    }
    
    console.log(`Cleaning up folder ${folderPath} (current size: ${currentSize} bytes)`);
    
    // Get all files sorted by date
    const files = await getFilesByDate(folderPath);
    
    // Delete files until we're under the limit
    let deletedSize = 0;
    for (const file of files) {
      if (currentSize - deletedSize <= MAX_FOLDER_SIZE) {
        break;
      }
      
      try {
        await fs.promises.unlink(file.path);
        deletedSize += file.size;
        console.log(`Deleted file: ${file.path}`);
      } catch (err) {
        console.error(`Error deleting file ${file.path}:`, err);
      }
    }
    
    console.log(`Cleanup complete. Deleted ${deletedSize} bytes`);
  } catch (err) {
    console.error(`Error cleaning up folder ${folderPath}:`, err);
  }
}

export async function cleanupAudioFolders(): Promise<void> {
  const tempDir = path.join(AUDIO_DIR, 'temp');
  const ttsDir = path.join(AUDIO_DIR, 'tts');
  
  // Clean up temp folder
  await cleanupFolder(tempDir);
  
  // Clean up tts folder
  await cleanupFolder(ttsDir);
} 
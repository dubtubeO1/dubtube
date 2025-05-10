export function extractYouTubeId(url: string): string | null {
  // Regular expression to match various YouTube URL formats
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  
  return (match && match[7].length === 11) ? match[7] : null;
}

export function isValidYouTubeUrl(url: string): boolean {
  const videoId = extractYouTubeId(url);
  return videoId !== null;
} 
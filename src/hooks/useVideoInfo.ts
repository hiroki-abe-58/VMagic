import { useState, useCallback } from 'react';
import type { VideoInfo } from '../types/video';
import { getVideoInfo } from '../lib/tauri-commands';

interface UseVideoInfoReturn {
  videoInfo: VideoInfo | null;
  isLoading: boolean;
  error: string | null;
  loadVideoInfo: (path: string) => Promise<void>;
  clearVideoInfo: () => void;
}

export function useVideoInfo(): UseVideoInfoReturn {
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVideoInfo = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const info = await getVideoInfo(path);
      setVideoInfo(info);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setVideoInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearVideoInfo = useCallback(() => {
    setVideoInfo(null);
    setError(null);
  }, []);

  return {
    videoInfo,
    isLoading,
    error,
    loadVideoInfo,
    clearVideoInfo,
  };
}


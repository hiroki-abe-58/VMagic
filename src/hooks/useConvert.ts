import { useState, useCallback, useEffect, useRef } from 'react';
import type { ConversionResult, ProgressEvent, ConversionStatus } from '../types/video';
import { convertVideo, cancelConversion, subscribeToProgress } from '../lib/tauri-commands';

interface UseConvertReturn {
  status: ConversionStatus;
  progress: ProgressEvent | null;
  result: ConversionResult | null;
  error: string | null;
  startConversion: (inputPath: string, outputPath: string, targetFps: number) => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
}

export function useConvert(): UseConvertReturn {
  const [status, setStatus] = useState<ConversionStatus>('idle');
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const unlistenRef = useRef<(() => void) | null>(null);

  // Setup progress listener
  useEffect(() => {
    let mounted = true;

    const setupListener = async () => {
      try {
        const unlisten = await subscribeToProgress((event) => {
          if (mounted) {
            setProgress(event);
          }
        });
        unlistenRef.current = unlisten;
      } catch (err) {
        console.error('Failed to setup progress listener:', err);
      }
    };

    setupListener();

    return () => {
      mounted = false;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, []);

  const startConversion = useCallback(async (
    inputPath: string,
    outputPath: string,
    targetFps: number
  ) => {
    setStatus('converting');
    setProgress(null);
    setResult(null);
    setError(null);

    try {
      const conversionResult = await convertVideo(inputPath, outputPath, targetFps);
      
      if (conversionResult.success) {
        setResult(conversionResult);
        setStatus('completed');
      } else {
        // Cancelled or failed
        if (conversionResult.message.includes('キャンセル')) {
          setStatus('cancelled');
        } else {
          setStatus('error');
          setError(conversionResult.message);
        }
        setResult(conversionResult);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus('error');
    }
  }, []);

  const cancel = useCallback(async () => {
    try {
      await cancelConversion();
      // Status will be updated when conversion actually stops
    } catch (err) {
      console.error('Failed to cancel conversion:', err);
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress(null);
    setResult(null);
    setError(null);
  }, []);

  return {
    status,
    progress,
    result,
    error,
    startConversion,
    cancel,
    reset,
  };
}


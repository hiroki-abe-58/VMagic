import { useState, useCallback, useEffect, useRef } from 'react';
import type { BatchItem, BatchItemStatus, BatchProgress } from '../types/video';
import { getVideoInfo, convertVideo, cancelConversion, subscribeToProgress } from '../lib/tauri-commands';

interface ConversionOptions {
  targetFps: number;
  useHwAccel: boolean;
  useHevc: boolean;
  qualityPreset: string;
}

interface UseBatchConvertReturn {
  items: BatchItem[];
  batchProgress: BatchProgress | null;
  isProcessing: boolean;
  addFiles: (paths: string[]) => Promise<void>;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  updateOutputPath: (id: string, outputPath: string) => void;
  startBatchConversion: (options: ConversionOptions) => Promise<void>;
  cancelBatchConversion: () => Promise<void>;
  reset: () => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateOutputPath(inputPath: string, targetFps: number): string {
  const lastSlashIndex = inputPath.lastIndexOf('/');
  const inputDir = lastSlashIndex >= 0 ? inputPath.substring(0, lastSlashIndex) : '';
  const filename = inputPath.substring(lastSlashIndex + 1);
  const baseName = filename.replace(/\.[^/.]+$/, '');
  const outputFilename = `${baseName}_${targetFps}fps.mp4`;
  return inputDir ? `${inputDir}/${outputFilename}` : outputFilename;
}

export function useBatchConvert(): UseBatchConvertReturn {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const cancelFlagRef = useRef(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  // Setup progress listener
  useEffect(() => {
    let mounted = true;

    const setupListener = async () => {
      try {
        const unlisten = await subscribeToProgress((event) => {
          if (mounted) {
            setItems(prev => prev.map(item => 
              item.status === 'converting' 
                ? { ...item, progress: event }
                : item
            ));
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

  const addFiles = useCallback(async (paths: string[]) => {
    // Filter out duplicates
    const existingPaths = new Set(items.map(item => item.inputPath));
    const newPaths = paths.filter(path => !existingPaths.has(path));

    if (newPaths.length === 0) return;

    // Create new items with loading status
    const newItems: BatchItem[] = newPaths.map(path => ({
      id: generateId(),
      inputPath: path,
      outputPath: '',
      videoInfo: null,
      status: 'loading' as BatchItemStatus,
      progress: null,
      result: null,
      error: null,
    }));

    setItems(prev => [...prev, ...newItems]);

    // Load video info for each file
    for (const item of newItems) {
      try {
        const info = await getVideoInfo(item.inputPath);
        setItems(prev => prev.map(i => 
          i.id === item.id 
            ? { 
                ...i, 
                videoInfo: info, 
                outputPath: generateOutputPath(item.inputPath, 60),
                status: 'ready' as BatchItemStatus 
              }
            : i
        ));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setItems(prev => prev.map(i => 
          i.id === item.id 
            ? { ...i, status: 'error' as BatchItemStatus, error: errorMessage }
            : i
        ));
      }
    }
  }, [items]);

  const removeFile = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    setItems([]);
    setBatchProgress(null);
  }, []);

  const updateOutputPath = useCallback((id: string, outputPath: string) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, outputPath } : item
    ));
  }, []);

  const startBatchConversion = useCallback(async (options: ConversionOptions) => {
    const { targetFps, useHwAccel, useHevc, qualityPreset } = options;
    const readyItems = items.filter(item => item.status === 'ready' || item.status === 'pending');
    if (readyItems.length === 0) return;

    setIsProcessing(true);
    cancelFlagRef.current = false;

    // Update output paths with target fps
    setItems(prev => prev.map(item => ({
      ...item,
      outputPath: item.videoInfo ? generateOutputPath(item.inputPath, targetFps) : item.outputPath,
      status: item.status === 'ready' ? 'pending' : item.status,
    })));

    setBatchProgress({
      totalFiles: readyItems.length,
      completedFiles: 0,
      currentFileIndex: 0,
      currentFileName: '',
      overallProgress: 0,
    });

    let completedCount = 0;

    for (let i = 0; i < readyItems.length; i++) {
      if (cancelFlagRef.current) break;

      const item = readyItems[i];
      const outputPath = generateOutputPath(item.inputPath, targetFps);

      // Update current item status
      setItems(prev => prev.map(it => 
        it.id === item.id 
          ? { ...it, status: 'converting' as BatchItemStatus, outputPath }
          : it
      ));

      setBatchProgress(prev => prev ? {
        ...prev,
        currentFileIndex: i,
        currentFileName: item.videoInfo?.filename || '',
        overallProgress: (completedCount / readyItems.length) * 100,
      } : null);

      try {
        const result = await convertVideo(item.inputPath, outputPath, targetFps, useHwAccel, useHevc, qualityPreset);
        
        if (result.success) {
          completedCount++;
          setItems(prev => prev.map(it => 
            it.id === item.id 
              ? { ...it, status: 'completed' as BatchItemStatus, result, progress: null }
              : it
          ));
        } else {
          if (result.message.includes('キャンセル')) {
            setItems(prev => prev.map(it => 
              it.id === item.id 
                ? { ...it, status: 'cancelled' as BatchItemStatus, result, progress: null }
                : it
            ));
          } else {
            setItems(prev => prev.map(it => 
              it.id === item.id 
                ? { ...it, status: 'error' as BatchItemStatus, result, error: result.message, progress: null }
                : it
            ));
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setItems(prev => prev.map(it => 
          it.id === item.id 
            ? { ...it, status: 'error' as BatchItemStatus, error: errorMessage, progress: null }
            : it
        ));
      }

      setBatchProgress(prev => prev ? {
        ...prev,
        completedFiles: completedCount,
        overallProgress: ((completedCount) / readyItems.length) * 100,
      } : null);
    }

    setIsProcessing(false);
  }, [items]);

  const cancelBatchConversion = useCallback(async () => {
    cancelFlagRef.current = true;
    try {
      await cancelConversion();
    } catch (err) {
      console.error('Failed to cancel conversion:', err);
    }
  }, []);

  const reset = useCallback(() => {
    setItems([]);
    setIsProcessing(false);
    setBatchProgress(null);
    cancelFlagRef.current = false;
  }, []);

  return {
    items,
    batchProgress,
    isProcessing,
    addFiles,
    removeFile,
    clearFiles,
    updateOutputPath,
    startBatchConversion,
    cancelBatchConversion,
    reset,
  };
}


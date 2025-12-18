import { useState, useCallback, useEffect, useRef } from 'react';
import type { BatchItem, BatchItemStatus, BatchProgress } from '../types/video';
import { getVideoInfo, convertVideo, upscaleVideo, compressVideo, cancelConversion, subscribeToProgress } from '../lib/tauri-commands';

interface ConversionOptions {
  mode: 'fps' | 'upscale' | 'compress';
  targetFps: number;
  useHwAccel: boolean;
  useHevc: boolean;
  qualityPreset: string;
  interpolationMethod: string;
  outputFormat: string;
  upscaleModel: string;
  upscaleScale: number;
  // Compression options
  targetSizeMb: number;
  compressWidth: number | null;
  compressHeight: number | null;
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

function generateOutputPath(
  inputPath: string, 
  mode: 'fps' | 'upscale' | 'compress',
  targetFps: number, 
  upscaleScale: number,
  targetSizeMb: number,
  outputFormat: string = 'mp4'
): string {
  const lastSlashIndex = inputPath.lastIndexOf('/');
  const inputDir = lastSlashIndex >= 0 ? inputPath.substring(0, lastSlashIndex) : '';
  const filename = inputPath.substring(lastSlashIndex + 1);
  const baseName = filename.replace(/\.[^/.]+$/, '');
  
  let suffix: string;
  if (mode === 'upscale') {
    suffix = `_${upscaleScale}x`;
  } else if (mode === 'compress') {
    suffix = `_${targetSizeMb}MB`;
  } else {
    suffix = `_${targetFps}fps`;
  }
  
  const outputFilename = `${baseName}${suffix}.${outputFormat}`;
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
                outputPath: generateOutputPath(item.inputPath, 'fps', 60, 4, 25, 'mp4'),
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
    const { mode, targetFps, useHwAccel, useHevc, qualityPreset, interpolationMethod, outputFormat, upscaleModel, upscaleScale, targetSizeMb, compressWidth, compressHeight } = options;
    const readyItems = items.filter(item => item.status === 'ready' || item.status === 'pending');
    if (readyItems.length === 0) return;

    setIsProcessing(true);
    cancelFlagRef.current = false;

    // Update output paths
    setItems(prev => prev.map(item => ({
      ...item,
      outputPath: item.videoInfo ? generateOutputPath(item.inputPath, mode, targetFps, upscaleScale, targetSizeMb, outputFormat) : item.outputPath,
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
      const outputPath = generateOutputPath(item.inputPath, mode, targetFps, upscaleScale, targetSizeMb, outputFormat);

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
        let result;
        if (mode === 'upscale') {
          result = await upscaleVideo(item.inputPath, outputPath, upscaleScale, upscaleModel, useHwAccel, useHevc, qualityPreset, outputFormat);
        } else if (mode === 'compress') {
          result = await compressVideo(item.inputPath, outputPath, targetSizeMb, compressWidth, compressHeight, useHwAccel, outputFormat);
        } else {
          result = await convertVideo(item.inputPath, outputPath, targetFps, useHwAccel, useHevc, qualityPreset, interpolationMethod, outputFormat);
        }
        
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


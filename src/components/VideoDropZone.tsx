import { useState, useCallback, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';

interface VideoDropZoneProps {
  onFileSelected: (path: string) => void;
  isDisabled?: boolean;
  hasVideo: boolean;
}

interface FileDropPayload {
  paths: string[];
  position: { x: number; y: number };
}

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'm4v', 'wmv', 'mpg', 'mpeg'];

function isVideoFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return VIDEO_EXTENSIONS.includes(ext);
}

export function VideoDropZone({ onFileSelected, isDisabled, hasVideo }: VideoDropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);

  // Listen for Tauri file drop events
  useEffect(() => {
    if (isDisabled) return;

    let unlistenDrop: (() => void) | undefined;
    let unlistenHover: (() => void) | undefined;
    let unlistenCancel: (() => void) | undefined;

    const setupListeners = async () => {
      // File drop event
      unlistenDrop = await listen<FileDropPayload>('tauri://drag-drop', (event) => {
        setIsDragActive(false);
        const paths = event.payload.paths;
        if (paths && paths.length > 0) {
          const videoPath = paths.find(p => isVideoFile(p));
          if (videoPath) {
            onFileSelected(videoPath);
          }
        }
      });

      // Drag hover event
      unlistenHover = await listen('tauri://drag-enter', () => {
        setIsDragActive(true);
      });

      // Drag cancel event
      unlistenCancel = await listen('tauri://drag-leave', () => {
        setIsDragActive(false);
      });
    };

    setupListeners();

    return () => {
      unlistenDrop?.();
      unlistenHover?.();
      unlistenCancel?.();
    };
  }, [isDisabled, onFileSelected]);

  const handleClick = useCallback(async () => {
    if (isDisabled) return;
    
    // Use Tauri dialog
    const { selectVideoFile } = await import('../lib/tauri-commands');
    const path = await selectVideoFile();
    if (path) {
      onFileSelected(path);
    }
  }, [isDisabled, onFileSelected]);

  return (
    <div
      onClick={handleClick}
      className={`
        relative w-full min-h-[200px] rounded-xl border-2 border-dashed
        flex flex-col items-center justify-center gap-4 p-8
        transition-all duration-300 cursor-pointer
        ${isDragActive 
          ? 'border-neon-yellow bg-neon-yellow/5' 
          : 'border-dark-border hover:border-neon-yellow/50 hover:bg-dark-surface-light/50'
        }
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${hasVideo ? 'border-neon-yellow/30 bg-dark-surface' : 'bg-dark-surface/50'}
      `}
    >
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5 pointer-events-none overflow-hidden rounded-xl">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Icon */}
      <div className={`
        w-20 h-20 rounded-full flex items-center justify-center
        ${isDragActive ? 'bg-neon-yellow/20' : 'bg-dark-surface-light'}
        transition-colors duration-300
      `}>
        <svg 
          className={`w-10 h-10 ${isDragActive ? 'text-neon-yellow' : 'text-text-secondary'}`}
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          {hasVideo ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" 
            />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
            />
          )}
        </svg>
      </div>

      {/* Text */}
      <div className="text-center z-10">
        <p className={`text-lg font-medium ${isDragActive ? 'text-neon-yellow' : 'text-text-primary'}`}>
          {hasVideo 
            ? '別の動画を選択' 
            : isDragActive 
              ? 'ドロップして動画を読み込み' 
              : '動画をドラッグ&ドロップ'
          }
        </p>
        <p className="text-sm text-text-secondary mt-1">
          またはクリックしてファイルを選択
        </p>
        <p className="text-xs text-text-muted mt-2">
          対応形式: MP4, MOV, AVI, MKV, WebM
        </p>
      </div>

      {/* Glow effect when dragging */}
      {isDragActive && (
        <div className="absolute inset-0 rounded-xl animate-pulse-glow pointer-events-none" />
      )}
    </div>
  );
}

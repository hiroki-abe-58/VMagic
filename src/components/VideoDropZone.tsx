import { useState, useCallback, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';

interface VideoDropZoneProps {
  onFilesSelected: (paths: string[]) => void;
  isDisabled?: boolean;
  fileCount: number;
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

export function VideoDropZone({ onFilesSelected, isDisabled, fileCount }: VideoDropZoneProps) {
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
          const videoPaths = paths.filter(p => isVideoFile(p));
          if (videoPaths.length > 0) {
            onFilesSelected(videoPaths);
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
  }, [isDisabled, onFilesSelected]);

  const handleClick = useCallback(async () => {
    if (isDisabled) return;
    
    const result = await open({
      multiple: true,
      filters: [
        {
          name: '動画ファイル',
          extensions: VIDEO_EXTENSIONS,
        },
      ],
    });
    
    if (result && Array.isArray(result) && result.length > 0) {
      onFilesSelected(result);
    } else if (result && typeof result === 'string') {
      onFilesSelected([result]);
    }
  }, [isDisabled, onFilesSelected]);

  return (
    <div
      onClick={handleClick}
      className={`
        relative w-full min-h-[160px] rounded-xl border-2 border-dashed
        flex flex-col items-center justify-center gap-3 p-6
        transition-all duration-300 cursor-pointer
        ${isDragActive 
          ? 'border-neon-yellow bg-neon-yellow/5' 
          : 'border-dark-border hover:border-neon-yellow/50 hover:bg-dark-surface-light/50'
        }
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${fileCount > 0 ? 'border-neon-yellow/30 bg-dark-surface' : 'bg-dark-surface/50'}
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
        w-16 h-16 rounded-full flex items-center justify-center
        ${isDragActive ? 'bg-neon-yellow/20' : 'bg-dark-surface-light'}
        transition-colors duration-300
      `}>
        <svg 
          className={`w-8 h-8 ${isDragActive ? 'text-neon-yellow' : 'text-text-secondary'}`}
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          {fileCount > 0 ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
              d="M12 4v16m8-8H4" 
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
        <p className={`text-base font-medium ${isDragActive ? 'text-neon-yellow' : 'text-text-primary'}`}>
          {fileCount > 0 
            ? '動画を追加' 
            : isDragActive 
              ? 'ドロップして動画を追加' 
              : '動画をドラッグ&ドロップ'
          }
        </p>
        <p className="text-sm text-text-secondary mt-1">
          {fileCount > 0 
            ? `${fileCount}ファイル選択中 - クリックで追加`
            : '複数ファイル選択可能'
          }
        </p>
        <p className="text-xs text-text-muted mt-1">
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

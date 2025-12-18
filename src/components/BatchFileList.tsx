import type { ReactElement } from 'react';
import type { BatchItem, BatchItemStatus } from '../types/video';

interface BatchFileListProps {
  items: BatchItem[];
  onRemove: (id: string) => void;
  isDisabled?: boolean;
}

function getStatusIcon(status: BatchItemStatus): ReactElement {
  switch (status) {
    case 'loading':
      return (
        <svg className="w-4 h-4 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      );
    case 'ready':
    case 'pending':
      return (
        <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'converting':
      return (
        <svg className="w-4 h-4 text-neon-yellow animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      );
    case 'completed':
      return (
        <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    case 'error':
      return (
        <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    case 'cancelled':
      return (
        <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      );
    default:
      return <></>;
  }
}

function getStatusText(status: BatchItemStatus): string {
  switch (status) {
    case 'loading': return '読み込み中...';
    case 'ready': return '準備完了';
    case 'pending': return '待機中';
    case 'converting': return '変換中';
    case 'completed': return '完了';
    case 'error': return 'エラー';
    case 'cancelled': return 'キャンセル';
    default: return '';
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function BatchFileList({ items, onRemove, isDisabled }: BatchFileListProps) {
  if (items.length === 0) return null;

  const completedCount = items.filter(i => i.status === 'completed').length;
  const errorCount = items.filter(i => i.status === 'error').length;

  return (
    <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <svg className="w-5 h-5 text-neon-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
          ファイルリスト
          <span className="text-sm font-normal text-text-muted">
            ({items.length}ファイル)
          </span>
        </h2>
        
        {/* Summary */}
        {(completedCount > 0 || errorCount > 0) && (
          <div className="flex items-center gap-3 text-sm">
            {completedCount > 0 && (
              <span className="flex items-center gap-1 text-green-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {completedCount}
              </span>
            )}
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-red-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                {errorCount}
              </span>
            )}
          </div>
        )}
      </div>

      {/* File List */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`
              bg-dark-surface-light rounded-lg p-3 flex items-center gap-4
              border transition-colors duration-200
              ${item.status === 'converting' 
                ? 'border-neon-yellow/50' 
                : item.status === 'completed'
                  ? 'border-green-500/30'
                  : item.status === 'error'
                    ? 'border-red-500/30'
                    : 'border-transparent'
              }
            `}
          >
            {/* Thumbnail */}
            <div className="flex-shrink-0 w-16 h-12 rounded-md overflow-hidden bg-dark-bg flex items-center justify-center">
              {item.status === 'loading' ? (
                <svg className="w-5 h-5 text-text-muted animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : item.videoInfo?.thumbnail ? (
                <img 
                  src={item.videoInfo.thumbnail} 
                  alt={item.videoInfo.filename}
                  className="w-full h-full object-cover"
                />
              ) : (
                <svg className="w-6 h-6 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </div>

            {/* Status Icon */}
            <div className="flex-shrink-0">
              {getStatusIcon(item.status)}
            </div>

            {/* File Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm text-text-primary truncate font-medium">
                  {item.videoInfo?.filename || item.inputPath.split('/').pop()}
                </p>
              </div>
              
              {item.videoInfo && (
                <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                  <span>{item.videoInfo.fps.toFixed(2)} fps</span>
                  <span>{item.videoInfo.width}x{item.videoInfo.height}</span>
                  <span>{formatDuration(item.videoInfo.duration)}</span>
                  <span>{formatFileSize(item.videoInfo.file_size)}</span>
                </div>
              )}

              {/* Progress bar for converting items */}
              {item.status === 'converting' && item.progress && (
                <div className="mt-2">
                  <div className="h-1 bg-dark-bg rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-neon-yellow transition-all duration-300"
                      style={{ width: `${item.progress.progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs text-text-muted">
                    <span>{item.progress.progress.toFixed(1)}%</span>
                    <span>{item.progress.speed}</span>
                  </div>
                </div>
              )}

              {/* Error message */}
              {item.status === 'error' && item.error && (
                <p className="text-xs text-red-400 mt-1 truncate" title={item.error}>
                  {item.error}
                </p>
              )}

              {/* Status text */}
              <p className={`text-xs mt-1 ${
                item.status === 'completed' ? 'text-green-500' :
                item.status === 'error' ? 'text-red-500' :
                item.status === 'converting' ? 'text-neon-yellow' :
                'text-text-muted'
              }`}>
                {getStatusText(item.status)}
              </p>
            </div>

            {/* Remove button */}
            {!isDisabled && item.status !== 'converting' && (
              <button
                onClick={() => onRemove(item.id)}
                className="flex-shrink-0 p-1.5 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                title="削除"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


import type { BatchProgress as BatchProgressType } from '../types/video';

interface BatchProgressProps {
  progress: BatchProgressType | null;
  isProcessing: boolean;
}

export function BatchProgress({ progress, isProcessing }: BatchProgressProps) {
  if (!isProcessing || !progress) return null;

  const { totalFiles, completedFiles, currentFileName, overallProgress } = progress;

  return (
    <div className="bg-dark-surface rounded-xl p-6 border border-neon-yellow/30">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-neon-yellow/20 flex items-center justify-center">
          <svg className="w-5 h-5 text-neon-yellow animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-text-primary">
            バッチ変換中
          </h3>
          <p className="text-sm text-text-muted">
            {completedFiles + 1} / {totalFiles} ファイル
          </p>
        </div>
        <div className="text-2xl font-bold text-neon-yellow">
          {overallProgress.toFixed(0)}%
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="mb-4">
        <div className="h-2 bg-dark-bg rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-neon-yellow to-yellow-400 transition-all duration-300"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Current file info */}
      {currentFileName && (
        <div className="bg-dark-surface-light rounded-lg p-3">
          <p className="text-xs text-text-muted mb-1">現在処理中:</p>
          <p className="text-sm text-text-primary truncate" title={currentFileName}>
            {currentFileName}
          </p>
        </div>
      )}

      {/* Progress segments */}
      <div className="mt-4 flex gap-1">
        {Array.from({ length: totalFiles }).map((_, i) => (
          <div
            key={i}
            className={`
              h-1.5 flex-1 rounded-full transition-colors duration-300
              ${i < completedFiles 
                ? 'bg-green-500' 
                : i === completedFiles 
                  ? 'bg-neon-yellow animate-pulse' 
                  : 'bg-dark-bg'
              }
            `}
          />
        ))}
      </div>
    </div>
  );
}


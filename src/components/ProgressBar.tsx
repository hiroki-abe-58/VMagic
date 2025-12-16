import type { ProgressEvent, ConversionStatus, ConversionResult } from '../types/video';

interface ProgressBarProps {
  status: ConversionStatus;
  progress: ProgressEvent | null;
  result: ConversionResult | null;
  error: string | null;
  onCancel: () => void;
}

export function ProgressBar({ status, progress, result, error, onCancel }: ProgressBarProps) {
  const isConverting = status === 'converting';
  const isCompleted = status === 'completed';
  const isError = status === 'error';
  const isCancelled = status === 'cancelled';

  const progressPercent = progress?.progress ?? 0;

  return (
    <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          {isConverting && (
            <svg className="w-5 h-5 text-neon-yellow animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" 
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" 
              />
            </svg>
          )}
          {isCompleted && (
            <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {isError && (
            <svg className="w-5 h-5 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {isCancelled && (
            <svg className="w-5 h-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
              />
            </svg>
          )}
          {isConverting ? '変換中...' : isCompleted ? '完了' : isError ? 'エラー' : isCancelled ? 'キャンセル' : '進捗'}
        </h2>

        {isConverting && (
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-error/10 text-error border border-error/30 
                       hover:bg-error/20 transition-colors text-sm"
          >
            キャンセル
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="relative h-3 bg-dark-surface-light rounded-full overflow-hidden mb-4">
        <div 
          className={`
            absolute left-0 top-0 h-full rounded-full transition-all duration-300
            ${isCompleted ? 'bg-success' : isError || isCancelled ? 'bg-error' : 'bg-neon-yellow'}
          `}
          style={{ width: `${isCompleted ? 100 : progressPercent}%` }}
        />
        {isConverting && (
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <div 
              className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-scan-line"
            />
          </div>
        )}
      </div>

      {/* Progress Details */}
      {isConverting && progress && (
        <div className="grid grid-cols-4 gap-4 text-center">
          <ProgressStat label="進捗" value={`${progressPercent.toFixed(1)}%`} />
          <ProgressStat label="フレーム" value={progress.frame.toLocaleString()} />
          <ProgressStat label="処理速度" value={`${progress.fps.toFixed(1)} fps`} />
          <ProgressStat label="速度" value={progress.speed || '計算中...'} />
        </div>
      )}

      {/* Completion Message */}
      {isCompleted && result && (
        <div className={`
          p-4 rounded-lg
          ${result.duration_valid ? 'bg-success/10 border border-success/30' : 'bg-warning/10 border border-warning/30'}
        `}>
          <div className="flex items-start gap-3">
            {result.duration_valid ? (
              <svg className="w-5 h-5 text-success flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-warning flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                />
              </svg>
            )}
            <div className="flex-1">
              <p className={result.duration_valid ? 'text-success' : 'text-warning'}>
                {result.message}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-text-muted">入力:</span>
                  <span className="text-text-primary ml-2 font-mono">{result.input_duration.toFixed(3)}s</span>
                </div>
                <div>
                  <span className="text-text-muted">出力:</span>
                  <span className="text-text-primary ml-2 font-mono">{result.output_duration.toFixed(3)}s</span>
                </div>
                <div>
                  <span className="text-text-muted">差:</span>
                  <span className={`ml-2 font-mono ${result.duration_valid ? 'text-success' : 'text-warning'}`}>
                    {result.duration_diff > 0 ? '+' : ''}{result.duration_diff.toFixed(3)}s
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {isError && error && (
        <div className="p-4 bg-error/10 border border-error/30 rounded-lg">
          <p className="text-error">{error}</p>
        </div>
      )}

      {/* Cancelled Message */}
      {isCancelled && (
        <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg">
          <p className="text-warning">変換がキャンセルされました</p>
        </div>
      )}
    </div>
  );
}

function ProgressStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-dark-surface-light rounded-lg p-2">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="font-mono text-text-primary">{value}</p>
    </div>
  );
}


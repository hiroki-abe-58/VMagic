import type { VideoInfo } from '../types/video';
import { formatDuration } from '../lib/tauri-commands';

interface OutputPreviewProps {
  inputInfo: VideoInfo;
  targetFps: number;
}

export function OutputPreview({ inputInfo, targetFps }: OutputPreviewProps) {
  // Calculate expected values
  const inputFps = inputInfo.fps;
  const duration = inputInfo.duration;
  
  // Frame count estimation
  const inputFrames = Math.round(duration * inputFps);
  const outputFrames = Math.round(duration * targetFps);
  
  // Frame change
  const frameChange = outputFrames - inputFrames;
  const frameChangePercent = ((frameChange / inputFrames) * 100).toFixed(1);
  
  // FPS change
  const fpsChange = targetFps - inputFps;
  const isUpscale = fpsChange > 0;

  return (
    <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
      <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-neon-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
          />
        </svg>
        出力プレビュー
      </h2>

      {/* Conversion Direction */}
      <div className={`
        mb-4 p-4 rounded-lg flex items-center gap-3
        ${isUpscale ? 'bg-neon-yellow/10' : 'bg-blue-500/10'}
      `}>
        <div className={`
          w-10 h-10 rounded-full flex items-center justify-center
          ${isUpscale ? 'bg-neon-yellow/20' : 'bg-blue-500/20'}
        `}>
          {isUpscale ? (
            <svg className="w-5 h-5 text-neon-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
        <div>
          <p className={`font-medium ${isUpscale ? 'text-neon-yellow' : 'text-blue-400'}`}>
            {isUpscale ? 'アップスケール' : 'ダウンスケール'}変換
          </p>
          <p className="text-sm text-text-secondary">
            {inputFps.toFixed(2)} fps → {targetFps.toFixed(2)} fps
            <span className="ml-2 opacity-70">
              ({fpsChange > 0 ? '+' : ''}{fpsChange.toFixed(2)} fps)
            </span>
          </p>
        </div>
      </div>

      {/* Comparison Grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Input Column */}
        <div className="text-center">
          <p className="text-xs text-text-muted mb-2 uppercase tracking-wide">入力</p>
          <div className="space-y-2">
            <div className="bg-dark-surface-light rounded-lg p-3">
              <p className="text-xs text-text-secondary">fps</p>
              <p className="font-mono text-text-primary">{inputFps.toFixed(2)}</p>
            </div>
            <div className="bg-dark-surface-light rounded-lg p-3">
              <p className="text-xs text-text-secondary">フレーム数</p>
              <p className="font-mono text-text-primary">{inputFrames.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-dark-surface-light flex items-center justify-center">
            <svg className="w-6 h-6 text-neon-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </div>
        </div>

        {/* Output Column */}
        <div className="text-center">
          <p className="text-xs text-text-muted mb-2 uppercase tracking-wide">出力</p>
          <div className="space-y-2">
            <div className="bg-neon-yellow/10 border border-neon-yellow/30 rounded-lg p-3">
              <p className="text-xs text-text-secondary">fps</p>
              <p className="font-mono text-neon-yellow">{targetFps.toFixed(2)}</p>
            </div>
            <div className="bg-dark-surface-light rounded-lg p-3">
              <p className="text-xs text-text-secondary">フレーム数</p>
              <p className="font-mono text-text-primary">{outputFrames.toLocaleString()}</p>
              <p className="text-xs text-text-muted">
                ({frameChange > 0 ? '+' : ''}{frameChange.toLocaleString()}, {frameChange > 0 ? '+' : ''}{frameChangePercent}%)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Duration Guarantee */}
      <div className="mt-4 p-4 bg-success/10 border border-success/30 rounded-lg">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-success flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" 
            />
          </svg>
          <div>
            <p className="text-success font-medium">総尺維持保証</p>
            <p className="text-sm text-text-secondary mt-1">
              出力動画の総尺: <span className="text-text-primary font-mono">{formatDuration(duration)}</span>
              <span className="text-text-muted ml-2">（変化なし）</span>
            </p>
            <p className="text-xs text-text-muted mt-1">
              minterpolateフィルタにより、フレーム補間を行いつつ総尺を維持します
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


import { useState, useEffect, useCallback } from 'react';
import { VideoDropZone } from './components/VideoDropZone';
import { VideoInfo } from './components/VideoInfo';
import { FpsSettings } from './components/FpsSettings';
import { OutputPreview } from './components/OutputPreview';
import { OutputSelector } from './components/OutputSelector';
import { ConvertButton } from './components/ConvertButton';
import { ProgressBar } from './components/ProgressBar';
import { useVideoInfo } from './hooks/useVideoInfo';
import { useConvert } from './hooks/useConvert';
import { checkFfmpeg } from './lib/tauri-commands';
import { DEFAULT_FPS } from './lib/presets';
import type { FFmpegStatus } from './types/video';

function App() {
  const [ffmpegStatus, setFfmpegStatus] = useState<FFmpegStatus | null>(null);
  const [targetFps, setTargetFps] = useState(DEFAULT_FPS);
  const [outputPath, setOutputPath] = useState('');

  const { videoInfo, isLoading: isLoadingVideo, error: videoError, loadVideoInfo, clearVideoInfo } = useVideoInfo();
  const { status, progress, result, error: convertError, startConversion, cancel, reset } = useConvert();

  // Check ffmpeg availability on mount
  useEffect(() => {
    const check = async () => {
      try {
        const status = await checkFfmpeg();
        setFfmpegStatus(status);
      } catch (err) {
        console.error('Failed to check ffmpeg:', err);
        setFfmpegStatus({ available: false, ffmpeg_path: null, ffprobe_path: null, version: null });
      }
    };
    check();
  }, []);

  // Handle file selection
  const handleFileSelected = useCallback(async (path: string) => {
    reset();
    setOutputPath('');
    await loadVideoInfo(path);
  }, [loadVideoInfo, reset]);

  // Handle conversion start
  const handleStartConversion = useCallback(async () => {
    if (!videoInfo || !outputPath) return;
    await startConversion(videoInfo.path, outputPath, targetFps);
  }, [videoInfo, outputPath, targetFps, startConversion]);

  // Handle new conversion
  const handleNewConversion = useCallback(() => {
    clearVideoInfo();
    reset();
    setOutputPath('');
  }, [clearVideoInfo, reset]);

  const isConverting = status === 'converting';
  const isCompleted = status === 'completed' || status === 'error' || status === 'cancelled';
  const canStartConversion = videoInfo && outputPath && !isConverting && status !== 'completed';

  return (
    <div className="flex flex-col min-h-screen bg-dark-bg">
      {/* Header */}
      <header className="bg-dark-surface/80 backdrop-blur-md border-b border-dark-border sticky top-0 z-50 flex-shrink-0">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-neon-yellow flex items-center justify-center">
              <svg className="w-6 h-6 text-dark-bg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M13 10V3L4 14h7v7l9-11h-7z" 
                />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary">VMagic</h1>
              <p className="text-xs text-text-secondary">FPS Converter</p>
            </div>
          </div>

          {/* FFmpeg Status */}
          <div className="flex items-center gap-2">
            {ffmpegStatus === null ? (
              <span className="text-text-muted text-sm">ffmpeg確認中...</span>
            ) : ffmpegStatus.available ? (
              <div className="flex items-center gap-2 text-success text-sm">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span>ffmpeg Ready</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-error text-sm">
                <div className="w-2 h-2 rounded-full bg-error" />
                <span>ffmpeg未検出</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content - Scrollable */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* FFmpeg Not Available Warning */}
          {ffmpegStatus && !ffmpegStatus.available && (
            <div className="mb-6 p-4 bg-error/10 border border-error/30 rounded-xl">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-error flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                  />
                </svg>
                <div>
                  <h3 className="text-error font-semibold">ffmpegがインストールされていません</h3>
                  <p className="text-text-secondary text-sm mt-1">
                    このアプリを使用するにはffmpegが必要です。以下のコマンドでインストールしてください:
                  </p>
                  <code className="block mt-2 p-3 bg-dark-bg rounded-lg font-mono text-sm text-neon-yellow">
                    brew install ffmpeg
                  </code>
                </div>
              </div>
            </div>
          )}

          {/* Video Error */}
          {videoError && (
            <div className="mb-6 p-4 bg-error/10 border border-error/30 rounded-xl">
              <p className="text-error">{videoError}</p>
            </div>
          )}

          <div className="space-y-6">
            {/* Video Drop Zone */}
            <VideoDropZone 
              onFileSelected={handleFileSelected}
              isDisabled={!ffmpegStatus?.available || isConverting}
              hasVideo={!!videoInfo}
            />

            {/* Loading State */}
            {isLoadingVideo && (
              <div className="flex items-center justify-center py-8">
                <svg className="w-8 h-8 text-neon-yellow animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" 
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" 
                  />
                </svg>
                <span className="ml-3 text-text-secondary">動画情報を読み込み中...</span>
              </div>
            )}

            {/* Video Info & Settings */}
            {videoInfo && !isLoadingVideo && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column */}
                  <div className="space-y-6">
                    <VideoInfo info={videoInfo} />
                    <OutputSelector 
                      inputPath={videoInfo.path}
                      inputFilename={videoInfo.filename}
                      targetFps={targetFps}
                      outputPath={outputPath}
                      onOutputPathChange={setOutputPath}
                      isDisabled={isConverting}
                    />
                  </div>

                  {/* Right Column */}
                  <div className="space-y-6">
                    <FpsSettings 
                      currentFps={videoInfo.fps}
                      targetFps={targetFps}
                      onTargetFpsChange={setTargetFps}
                      isDisabled={isConverting}
                    />
                    <OutputPreview 
                      inputInfo={videoInfo}
                      targetFps={targetFps}
                    />
                  </div>
                </div>

                {/* Progress Bar */}
                {(isConverting || isCompleted) && (
                  <ProgressBar 
                    status={status}
                    progress={progress}
                    result={result}
                    error={convertError}
                    onCancel={cancel}
                  />
                )}

                {/* Action Buttons */}
                <div className="flex gap-4">
                  {isCompleted ? (
                    <button
                      onClick={handleNewConversion}
                      className="flex-1 py-4 px-6 rounded-xl font-semibold text-lg
                                 bg-dark-surface-light text-text-primary border border-dark-border
                                 hover:border-neon-yellow/50 transition-all duration-300
                                 flex items-center justify-center gap-3"
                    >
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                        />
                      </svg>
                      新しい変換
                    </button>
                  ) : (
                    <ConvertButton 
                      onClick={handleStartConversion}
                      isDisabled={!canStartConversion}
                      isConverting={isConverting}
                    />
                  )}
                </div>
              </>
            )}

            {/* Empty State */}
            {!videoInfo && !isLoadingVideo && ffmpegStatus?.available && (
              <div className="text-center py-8">
                <p className="text-text-muted">
                  動画ファイルをドロップまたは選択して、フレームレート変換を開始してください
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-text-muted text-sm flex-shrink-0 border-t border-dark-border">
        <p>VMagic - minterpolateベースのフレーム補間変換</p>
        <p className="text-xs mt-1 opacity-70">総尺維持保証 (許容誤差 ±0.1秒)</p>
      </footer>
    </div>
  );
}

export default App;

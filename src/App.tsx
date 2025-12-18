import { useState, useEffect, useCallback } from 'react';
import { VideoDropZone } from './components/VideoDropZone';
import { FpsSettings } from './components/FpsSettings';
import { BatchFileList } from './components/BatchFileList';
import { BatchProgress } from './components/BatchProgress';
import { checkFfmpeg } from './lib/tauri-commands';
import { useBatchConvert } from './hooks/useBatchConvert';
import { DEFAULT_FPS } from './lib/presets';
import type { FFmpegStatus, QualityPreset, InterpolationMethod, OutputFormat } from './types/video';

function App() {
  const [ffmpegStatus, setFfmpegStatus] = useState<FFmpegStatus | null>(null);
  const [targetFps, setTargetFps] = useState(DEFAULT_FPS);
  const [useHwAccel, setUseHwAccel] = useState(true);
  const [useHevc, setUseHevc] = useState(false);
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>('balanced');
  const [interpolationMethod, setInterpolationMethod] = useState<InterpolationMethod>('minterpolate');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('mp4');

  const {
    items,
    batchProgress,
    isProcessing,
    addFiles,
    removeFile,
    clearFiles,
    startBatchConversion,
    cancelBatchConversion,
    reset,
  } = useBatchConvert();

  // Check ffmpeg availability on mount
  useEffect(() => {
    const check = async () => {
      try {
        const status = await checkFfmpeg();
        setFfmpegStatus(status);
        // Disable hw accel if VideoToolbox not available
        if (!status.videotoolbox_available) {
          setUseHwAccel(false);
        }
      } catch (err) {
        console.error('Failed to check ffmpeg:', err);
        setFfmpegStatus({ 
          available: false, 
          ffmpeg_path: null, 
          ffprobe_path: null, 
          version: null, 
          videotoolbox_available: false,
          hevc_available: false,
          rife_available: false,
          rife_path: null,
        });
      }
    };
    check();
  }, []);

  // Handle file selection
  const handleFilesSelected = useCallback(async (paths: string[]) => {
    await addFiles(paths);
  }, [addFiles]);

  // Handle conversion start
  const handleStartConversion = useCallback(async () => {
    if (items.length === 0) return;
    await startBatchConversion({
      targetFps,
      useHwAccel,
      useHevc,
      qualityPreset,
      interpolationMethod,
      outputFormat,
    });
  }, [items, targetFps, useHwAccel, useHevc, qualityPreset, interpolationMethod, outputFormat, startBatchConversion]);

  // Handle reset
  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  // Handle clear
  const handleClear = useCallback(() => {
    clearFiles();
  }, [clearFiles]);

  const hasFiles = items.length > 0;
  const readyFiles = items.filter(i => i.status === 'ready' || i.status === 'pending');
  const hasCompletedAll = items.length > 0 && items.every(i => i.status === 'completed' || i.status === 'error' || i.status === 'cancelled');
  const canStartConversion = readyFiles.length > 0 && !isProcessing;
  const averageFps = items.length > 0 
    ? items.reduce((sum, i) => sum + (i.videoInfo?.fps || 0), 0) / items.filter(i => i.videoInfo).length 
    : 0;

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
              <p className="text-xs text-text-secondary">Batch FPS Converter</p>
            </div>
          </div>

          {/* FFmpeg Status */}
          <div className="flex items-center gap-4">
            {ffmpegStatus?.rife_available && (
              <div className="flex items-center gap-2 text-purple-400 text-sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" 
                  />
                </svg>
                <span>RIFE</span>
              </div>
            )}
            {ffmpegStatus?.videotoolbox_available && (
              <div className="flex items-center gap-2 text-neon-yellow text-sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M13 10V3L4 14h7v7l9-11h-7z" 
                  />
                </svg>
                <span>VideoToolbox</span>
              </div>
            )}
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

          <div className="space-y-6">
            {/* Video Drop Zone */}
            <VideoDropZone 
              onFilesSelected={handleFilesSelected}
              isDisabled={!ffmpegStatus?.available || isProcessing}
              fileCount={items.length}
            />

            {/* Batch File List */}
            {hasFiles && (
              <BatchFileList 
                items={items}
                onRemove={removeFile}
                isDisabled={isProcessing}
              />
            )}

            {/* FPS Settings */}
            {hasFiles && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <FpsSettings 
                  currentFps={averageFps}
                  targetFps={targetFps}
                  onTargetFpsChange={setTargetFps}
                  isDisabled={isProcessing}
                />
                
                {/* Encoding Settings */}
                <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
                  <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-neon-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                      />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    エンコード設定
                  </h2>
                  <div className="space-y-4">
                    {/* Hardware Acceleration Toggle */}
                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-text-secondary text-sm">ハードウェア高速化</span>
                        {ffmpegStatus?.videotoolbox_available ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-neon-yellow/20 text-neon-yellow">
                            VideoToolbox
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded bg-dark-bg text-text-muted">
                            利用不可
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setUseHwAccel(!useHwAccel)}
                        disabled={!ffmpegStatus?.videotoolbox_available || isProcessing}
                        className={`
                          relative w-12 h-6 rounded-full transition-colors duration-200
                          ${useHwAccel && ffmpegStatus?.videotoolbox_available
                            ? 'bg-neon-yellow' 
                            : 'bg-dark-bg'
                          }
                          ${(!ffmpegStatus?.videotoolbox_available || isProcessing) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                      >
                        <div className={`
                          absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200
                          ${useHwAccel && ffmpegStatus?.videotoolbox_available ? 'translate-x-7' : 'translate-x-1'}
                        `} />
                      </button>
                    </div>

                    {/* HEVC Toggle */}
                    <div className="flex items-center justify-between py-2 border-t border-dark-border">
                      <div className="flex items-center gap-2">
                        <span className="text-text-secondary text-sm">HEVC (H.265)</span>
                        {ffmpegStatus?.hevc_available ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                            高圧縮
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded bg-dark-bg text-text-muted">
                            利用不可
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setUseHevc(!useHevc)}
                        disabled={!ffmpegStatus?.hevc_available || isProcessing}
                        className={`
                          relative w-12 h-6 rounded-full transition-colors duration-200
                          ${useHevc && ffmpegStatus?.hevc_available
                            ? 'bg-blue-500' 
                            : 'bg-dark-bg'
                          }
                          ${(!ffmpegStatus?.hevc_available || isProcessing) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                      >
                        <div className={`
                          absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200
                          ${useHevc && ffmpegStatus?.hevc_available ? 'translate-x-7' : 'translate-x-1'}
                        `} />
                      </button>
                    </div>

                    {/* Interpolation Method */}
                    <div className="py-2 border-t border-dark-border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-text-secondary text-sm">フレーム補間方式</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {/* RIFE AI option - highlighted if available */}
                        <button
                          onClick={() => setInterpolationMethod('rife')}
                          disabled={!ffmpegStatus?.rife_available || isProcessing}
                          className={`
                            py-2 px-3 rounded-lg text-sm font-medium transition-colors duration-200
                            ${interpolationMethod === 'rife'
                              ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                              : ffmpegStatus?.rife_available
                                ? 'bg-dark-bg text-text-secondary hover:bg-dark-surface-light border border-purple-500/30'
                                : 'bg-dark-bg text-text-muted opacity-50 cursor-not-allowed'
                            }
                            ${(!ffmpegStatus?.rife_available || isProcessing) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                          `}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                            AI (RIFE)
                          </div>
                        </button>
                        <button
                          onClick={() => setInterpolationMethod('minterpolate')}
                          disabled={isProcessing}
                          className={`
                            py-2 px-3 rounded-lg text-sm font-medium transition-colors duration-200
                            ${interpolationMethod === 'minterpolate'
                              ? 'bg-purple-500 text-white'
                              : 'bg-dark-bg text-text-secondary hover:bg-dark-surface-light'
                            }
                            ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                          `}
                        >
                          高品質
                        </button>
                        <button
                          onClick={() => setInterpolationMethod('framerate')}
                          disabled={isProcessing}
                          className={`
                            py-2 px-3 rounded-lg text-sm font-medium transition-colors duration-200
                            ${interpolationMethod === 'framerate'
                              ? 'bg-purple-500 text-white'
                              : 'bg-dark-bg text-text-secondary hover:bg-dark-surface-light'
                            }
                            ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                          `}
                        >
                          バランス
                        </button>
                        <button
                          onClick={() => setInterpolationMethod('duplicate')}
                          disabled={isProcessing}
                          className={`
                            py-2 px-3 rounded-lg text-sm font-medium transition-colors duration-200
                            ${interpolationMethod === 'duplicate'
                              ? 'bg-purple-500 text-white'
                              : 'bg-dark-bg text-text-secondary hover:bg-dark-surface-light'
                            }
                            ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                          `}
                        >
                          高速
                        </button>
                      </div>
                      <p className="text-xs text-text-muted mt-2">
                        {interpolationMethod === 'rife' && 'AI補間: 最高品質、GPU高速処理 (要RIFEインストール)'}
                        {interpolationMethod === 'minterpolate' && 'モーション補間: 高品質だが処理が遅い (CPU集約)'}
                        {interpolationMethod === 'framerate' && 'フレームブレンド: 品質と速度のバランス'}
                        {interpolationMethod === 'duplicate' && 'フレーム複製: 最速だが品質は低い'}
                      </p>
                      {!ffmpegStatus?.rife_available && (
                        <p className="text-xs text-orange-400 mt-1">
                          RIFE未検出: AI補間を使用するにはrife-ncnn-vulkanをインストールしてください
                        </p>
                      )}
                    </div>

                    {/* Quality Preset */}
                    <div className="py-2 border-t border-dark-border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-text-secondary text-sm">エンコード品質</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(['fast', 'balanced', 'quality'] as QualityPreset[]).map((preset) => (
                          <button
                            key={preset}
                            onClick={() => setQualityPreset(preset)}
                            disabled={isProcessing}
                            className={`
                              py-2 px-3 rounded-lg text-sm font-medium transition-colors duration-200
                              ${qualityPreset === preset
                                ? 'bg-neon-yellow text-dark-bg'
                                : 'bg-dark-bg text-text-secondary hover:bg-dark-surface-light'
                              }
                              ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                          >
                            {preset === 'fast' && '高速'}
                            {preset === 'balanced' && 'バランス'}
                            {preset === 'quality' && '高品質'}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-text-muted mt-2">
                        {qualityPreset === 'fast' && '処理速度優先。ファイルサイズが大きくなる場合があります'}
                        {qualityPreset === 'balanced' && '速度と品質のバランスを取った設定'}
                        {qualityPreset === 'quality' && '最高品質。処理に時間がかかります'}
                      </p>
                    </div>

                    {/* Output Format */}
                    <div className="py-2 border-t border-dark-border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-text-secondary text-sm">出力形式</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {(['mp4', 'mov', 'webm', 'mkv'] as OutputFormat[]).map((format) => (
                          <button
                            key={format}
                            onClick={() => setOutputFormat(format)}
                            disabled={isProcessing}
                            className={`
                              py-2 px-3 rounded-lg text-sm font-medium transition-colors duration-200 uppercase
                              ${outputFormat === format
                                ? 'bg-green-500 text-white'
                                : 'bg-dark-bg text-text-secondary hover:bg-dark-surface-light'
                              }
                              ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                          >
                            {format}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-text-muted mt-2">
                        {outputFormat === 'mp4' && `MP4 (${useHevc ? 'HEVC/H.265' : 'H.264'}) - 最も互換性が高い`}
                        {outputFormat === 'mov' && `MOV (${useHevc ? 'HEVC/H.265' : 'H.264'}) - Apple製品向け`}
                        {outputFormat === 'webm' && 'WebM (VP9) - Web向け、透過対応'}
                        {outputFormat === 'mkv' && `MKV (${useHevc ? 'HEVC/H.265' : 'H.264'}) - 高い柔軟性`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Batch Progress */}
            <BatchProgress 
              progress={batchProgress}
              isProcessing={isProcessing}
            />

            {/* Action Buttons */}
            {hasFiles && (
              <div className="flex gap-4">
                {hasCompletedAll ? (
                  <button
                    onClick={handleReset}
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
                ) : isProcessing ? (
                  <button
                    onClick={cancelBatchConversion}
                    className="flex-1 py-4 px-6 rounded-xl font-semibold text-lg
                               bg-error/20 text-error border border-error/30
                               hover:bg-error/30 transition-all duration-300
                               flex items-center justify-center gap-3"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M6 18L18 6M6 6l12 12" 
                      />
                    </svg>
                    キャンセル
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleClear}
                      className="py-4 px-6 rounded-xl font-semibold text-lg
                                 bg-dark-surface-light text-text-secondary border border-dark-border
                                 hover:border-red-500/50 hover:text-red-500 transition-all duration-300
                                 flex items-center justify-center gap-3"
                    >
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" 
                        />
                      </svg>
                      クリア
                    </button>
                    <button
                      onClick={handleStartConversion}
                      disabled={!canStartConversion}
                      className={`flex-1 py-4 px-6 rounded-xl font-semibold text-lg
                                 flex items-center justify-center gap-3 transition-all duration-300
                                 ${canStartConversion 
                                   ? 'bg-neon-yellow text-dark-bg hover:bg-neon-yellow/90 shadow-lg shadow-neon-yellow/20' 
                                   : 'bg-dark-surface-light text-text-muted cursor-not-allowed'
                                 }`}
                    >
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" 
                        />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                        />
                      </svg>
                      バッチ変換開始 ({readyFiles.length}ファイル)
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Empty State */}
            {!hasFiles && ffmpegStatus?.available && (
              <div className="text-center py-8">
                <p className="text-text-muted">
                  動画ファイルをドロップまたは選択して、フレームレート変換を開始してください
                </p>
                <p className="text-text-muted text-sm mt-2">
                  複数ファイルの一括変換に対応しています
                </p>
                {ffmpegStatus?.videotoolbox_available && (
                  <p className="text-neon-yellow text-sm mt-2 flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M13 10V3L4 14h7v7l9-11h-7z" 
                      />
                    </svg>
                    Apple Silicon高速化対応
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-text-muted text-sm flex-shrink-0 border-t border-dark-border">
        <p>VMagic - フレーム補間変換ツール</p>
        <p className="text-xs mt-1 opacity-70">総尺維持保証 (許容誤差 ±0.1秒)</p>
      </footer>
    </div>
  );
}

export default App;

import { useState, useEffect, useCallback } from 'react';
import { VideoDropZone } from './components/VideoDropZone';
import { FpsSettings } from './components/FpsSettings';
import { BatchFileList } from './components/BatchFileList';
import { BatchProgress } from './components/BatchProgress';
import { checkFfmpeg, getAudioInfo, processAudio, selectAudioFiles, subscribeToProgress, getMediaDetailInfo, selectMediaFile, formatFileSize, formatDuration, formatBitrate } from './lib/tauri-commands';
import { useBatchConvert } from './hooks/useBatchConvert';
import { DEFAULT_FPS } from './lib/presets';
import type { FFmpegStatus, QualityPreset, InterpolationMethod, OutputFormat, UpscaleModel, UpscaleScale, TargetResolution, DownscaleResolution, AudioOutputFormat, AudioQuality, AudioInfo, ProgressEvent, MediaDetailInfo } from './types/video';
import { TARGET_RESOLUTIONS, getAvailableResolutions, FILE_SIZE_PRESETS, DOWNSCALE_RESOLUTIONS, getAvailableDownscaleResolutions, calculateTargetBitrate } from './types/video';

type AppMode = 'fps' | 'upscale' | 'compress' | 'audio' | 'info';

// Audio file item for batch processing
interface AudioItem {
    id: string;
    inputPath: string;
    outputPath: string;
    audioInfo: AudioInfo | null;
    status: 'pending' | 'loading' | 'ready' | 'processing' | 'completed' | 'error' | 'cancelled';
    progress: ProgressEvent | null;
    error: string | null;
}

function App() {
    const [ffmpegStatus, setFfmpegStatus] = useState<FFmpegStatus | null>(null);
    const [appMode, setAppMode] = useState<AppMode>('fps');
    const [targetFps, setTargetFps] = useState(DEFAULT_FPS);
    const [useHwAccel, setUseHwAccel] = useState(true);
    const [useHevc, setUseHevc] = useState(false);
    const [qualityPreset, setQualityPreset] = useState<QualityPreset>('balanced');
    const [interpolationMethod, setInterpolationMethod] = useState<InterpolationMethod>('minterpolate');
    const [outputFormat, setOutputFormat] = useState<OutputFormat>('mp4');
    // Upscale settings
    const [upscaleModel, setUpscaleModel] = useState<UpscaleModel>('realesrgan-x4plus');
    const [upscaleScale, setUpscaleScale] = useState<UpscaleScale>(4);
    const [upscaleMode, setUpscaleMode] = useState<'resolution' | 'scale'>('resolution');
    const [targetResolution, setTargetResolution] = useState<TargetResolution | null>(TARGET_RESOLUTIONS[3]); // Default to 4K
    // Compression settings
    const [targetSizeMb, setTargetSizeMb] = useState<number>(25);
    const [compressResolution, setCompressResolution] = useState<DownscaleResolution>(DOWNSCALE_RESOLUTIONS[0]); // Original

    // Audio settings
    const [audioItems, setAudioItems] = useState<AudioItem[]>([]);
    const [paddingBefore, setPaddingBefore] = useState<number>(0);
    const [paddingAfter, setPaddingAfter] = useState<number>(0);
    const [audioOutputFormat, setAudioOutputFormat] = useState<AudioOutputFormat>('wav');
    const [audioQuality, setAudioQuality] = useState<AudioQuality>('high');
    const [isAudioProcessing, setIsAudioProcessing] = useState(false);
    const [audioProgress, setAudioProgress] = useState<ProgressEvent | null>(null);

    // Info tab state
    const [mediaInfo, setMediaInfo] = useState<MediaDetailInfo | null>(null);
    const [isLoadingInfo, setIsLoadingInfo] = useState(false);
    const [infoError, setInfoError] = useState<string | null>(null);
    const [isDraggingInfo, setIsDraggingInfo] = useState(false);

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
                    realesrgan_available: false,
                    realesrgan_path: null,
                });
            }
        };
        check();
    }, []);

    // Handle file selection
    const handleFilesSelected = useCallback(async (paths: string[]) => {
        await addFiles(paths);
    }, [addFiles]);

    // Handle conversion start (for video modes only)
    const handleStartConversion = useCallback(async () => {
        if (items.length === 0 || appMode === 'audio') return;
        await startBatchConversion({
            mode: appMode as 'fps' | 'upscale' | 'compress',
            targetFps,
            useHwAccel,
            useHevc,
            qualityPreset,
            interpolationMethod,
            outputFormat,
            upscaleModel,
            upscaleScale,
            targetSizeMb,
            compressWidth: compressResolution.width > 0 ? compressResolution.width : null,
            compressHeight: compressResolution.height > 0 ? compressResolution.height : null,
        });
    }, [items, appMode, targetFps, useHwAccel, useHevc, qualityPreset, interpolationMethod, outputFormat, upscaleModel, upscaleScale, targetSizeMb, compressResolution, startBatchConversion]);

    // Handle reset
    const handleReset = useCallback(() => {
        reset();
    }, [reset]);

    // Handle clear
    const handleClear = useCallback(() => {
        clearFiles();
    }, [clearFiles]);

    // Audio file handling
    const handleAddAudioFiles = useCallback(async () => {
        const paths = await selectAudioFiles();
        if (!paths || paths.length === 0) return;

        const newItems: AudioItem[] = paths.map(path => ({
            id: `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            inputPath: path,
            outputPath: '',
            audioInfo: null,
            status: 'loading' as const,
            progress: null,
            error: null,
        }));

        setAudioItems(prev => [...prev, ...newItems]);

        // Load audio info for each file
        for (const item of newItems) {
            try {
                const info = await getAudioInfo(item.inputPath);
                const ext = audioOutputFormat;
                const baseName = info.filename.replace(/\.[^/.]+$/, '');
                const dir = item.inputPath.substring(0, item.inputPath.lastIndexOf('/'));
                const outputPath = `${dir}/${baseName}_padded.${ext}`;

                setAudioItems(prev =>
                    prev.map(i =>
                        i.id === item.id
                            ? { ...i, audioInfo: info, outputPath, status: 'ready' }
                            : i
                    )
                );
            } catch (error) {
                setAudioItems(prev =>
                    prev.map(i =>
                        i.id === item.id
                            ? { ...i, status: 'error', error: String(error) }
                            : i
                    )
                );
            }
        }
    }, [audioOutputFormat]);

    const handleRemoveAudioFile = useCallback((id: string) => {
        setAudioItems(prev => prev.filter(i => i.id !== id));
    }, []);

    const handleClearAudioFiles = useCallback(() => {
        setAudioItems([]);
    }, []);

    const handleStartAudioProcessing = useCallback(async () => {
        if (audioItems.length === 0 || isAudioProcessing) return;

        setIsAudioProcessing(true);

        // Subscribe to progress events
        const unsubscribe = await subscribeToProgress((event) => {
            setAudioProgress(event);
        });

        try {
            for (const item of audioItems) {
                if (item.status !== 'ready') continue;

                // Update status to processing
                setAudioItems(prev =>
                    prev.map(i => i.id === item.id ? { ...i, status: 'processing' } : i)
                );

                try {
                    // Generate output path with correct extension
                    const ext = audioOutputFormat;
                    const baseName = item.audioInfo?.filename.replace(/\.[^/.]+$/, '') || 'output';
                    const dir = item.inputPath.substring(0, item.inputPath.lastIndexOf('/'));
                    const outputPath = `${dir}/${baseName}_padded.${ext}`;

                    await processAudio(
                        item.inputPath,
                        outputPath,
                        paddingBefore,
                        paddingAfter,
                        audioOutputFormat,
                        audioQuality
                    );

                    setAudioItems(prev =>
                        prev.map(i =>
                            i.id === item.id
                                ? { ...i, status: 'completed', outputPath }
                                : i
                        )
                    );
                } catch (error) {
                    setAudioItems(prev =>
                        prev.map(i =>
                            i.id === item.id
                                ? { ...i, status: 'error', error: String(error) }
                                : i
                        )
                    );
                }
            }
        } finally {
            unsubscribe();
            setIsAudioProcessing(false);
            setAudioProgress(null);
        }
    }, [audioItems, isAudioProcessing, paddingBefore, paddingAfter, audioOutputFormat, audioQuality]);

    const handleResetAudio = useCallback(() => {
        setAudioItems([]);
        setAudioProgress(null);
    }, []);

    // Load media info from path (defined first for use by other handlers)
    const loadMediaInfo = useCallback(async (path: string) => {
        setIsLoadingInfo(true);
        setInfoError(null);
        setMediaInfo(null);

        try {
            const info = await getMediaDetailInfo(path);
            setMediaInfo(info);
        } catch (error) {
            setInfoError(String(error));
        } finally {
            setIsLoadingInfo(false);
        }
    }, []);

    // Info tab handlers
    const handleSelectMediaFile = useCallback(async () => {
        const path = await selectMediaFile();
        if (!path) return;
        await loadMediaInfo(path);
    }, [loadMediaInfo]);

    const handleClearMediaInfo = useCallback(() => {
        setMediaInfo(null);
        setInfoError(null);
    }, []);

    // Info tab drag & drop handlers
    const handleInfoDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isLoadingInfo) {
            setIsDraggingInfo(true);
        }
    }, [isLoadingInfo]);

    const handleInfoDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingInfo(false);
    }, []);

    const handleInfoDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingInfo(false);

        if (isLoadingInfo) return;

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            // Get file path from Tauri's file drop
            const path = (file as any).path;
            if (path) {
                await loadMediaInfo(path);
            }
        }
    }, [isLoadingInfo, loadMediaInfo]);

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
                        {ffmpegStatus?.realesrgan_available && (
                            <div className="flex items-center gap-2 text-cyan-400 text-sm">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                                    />
                                </svg>
                                <span>ESRGAN</span>
                            </div>
                        )}
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
                        {/* Mode Selector */}
                        <div className="bg-dark-surface rounded-xl p-2 border border-dark-border flex">
                            <button
                                onClick={() => setAppMode('fps')}
                                disabled={isProcessing || isAudioProcessing}
                                className={`
                  flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-200
                  flex items-center justify-center gap-2
                  ${appMode === 'fps'
                                        ? 'bg-neon-yellow text-dark-bg'
                                        : 'text-text-secondary hover:text-text-primary hover:bg-dark-surface-light'
                                    }
                  ${(isProcessing || isAudioProcessing) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M13 10V3L4 14h7v7l9-11h-7z"
                                    />
                                </svg>
                                FPS変換
                            </button>
                            <button
                                onClick={() => setAppMode('upscale')}
                                disabled={isProcessing || isAudioProcessing}
                                className={`
                  flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-200
                  flex items-center justify-center gap-2
                  ${appMode === 'upscale'
                                        ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                                        : 'text-text-secondary hover:text-text-primary hover:bg-dark-surface-light'
                                    }
                  ${(isProcessing || isAudioProcessing) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                                    />
                                </svg>
                                AI高画質化
                            </button>
                            <button
                                onClick={() => setAppMode('compress')}
                                disabled={isProcessing || isAudioProcessing}
                                className={`
                  flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-200
                  flex items-center justify-center gap-2
                  ${appMode === 'compress'
                                        ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white'
                                        : 'text-text-secondary hover:text-text-primary hover:bg-dark-surface-light'
                                    }
                  ${(isProcessing || isAudioProcessing) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M19 14l-7 7m0 0l-7-7m7 7V3"
                                    />
                                </svg>
                                圧縮
                            </button>
                            <button
                                onClick={() => setAppMode('audio')}
                                disabled={isProcessing || isAudioProcessing}
                                className={`
                  flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-200
                  flex items-center justify-center gap-2
                  ${appMode === 'audio'
                                        ? 'bg-gradient-to-r from-green-500 to-teal-500 text-white'
                                        : 'text-text-secondary hover:text-text-primary hover:bg-dark-surface-light'
                                    }
                  ${(isProcessing || isAudioProcessing) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                                    />
                                </svg>
                                音声
                            </button>
                            <button
                                onClick={() => setAppMode('info')}
                                disabled={isProcessing || isAudioProcessing}
                                className={`
                  flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-200
                  flex items-center justify-center gap-2
                  ${appMode === 'info'
                                        ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                                        : 'text-text-secondary hover:text-text-primary hover:bg-dark-surface-light'
                                    }
                  ${(isProcessing || isAudioProcessing) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                </svg>
                                情報
                            </button>
                        </div>

                        {/* Video Drop Zone - for video modes only */}
                        {appMode !== 'audio' && appMode !== 'info' && (
                            <VideoDropZone
                                onFilesSelected={handleFilesSelected}
                                isDisabled={!ffmpegStatus?.available || isProcessing}
                                fileCount={items.length}
                            />
                        )}

                        {/* Batch File List - for video modes only */}
                        {appMode !== 'audio' && appMode !== 'info' && hasFiles && (
                            <BatchFileList
                                items={items}
                                onRemove={removeFile}
                                isDisabled={isProcessing}
                            />
                        )}

                        {/* FPS Settings - only in FPS mode */}
                        {hasFiles && appMode === 'fps' && (
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

                                        {/* Interpolation Method - FPS mode only */}
                                        {appMode === 'fps' && (
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
                                        )}

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

                        {/* Upscale Settings - only in Upscale mode */}
                        {hasFiles && appMode === 'upscale' && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Upscale Model Selection */}
                                <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
                                    <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                                            />
                                        </svg>
                                        アップスケール設定
                                    </h2>

                                    {!ffmpegStatus?.realesrgan_available && (
                                        <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                                            <p className="text-sm text-orange-400">
                                                Real-ESRGAN未検出: AI高画質化を使用するにはrealesrgan-ncnn-vulkanをインストールしてください
                                            </p>
                                        </div>
                                    )}

                                    <div className="space-y-4">
                                        {/* Mode Toggle: Resolution vs Scale */}
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-text-secondary text-sm">指定方法</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    onClick={() => setUpscaleMode('resolution')}
                                                    disabled={isProcessing}
                                                    className={`
                            py-2 px-3 rounded-lg text-sm font-medium transition-colors duration-200
                            ${upscaleMode === 'resolution'
                                                            ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                                                            : 'bg-dark-bg text-text-secondary hover:bg-dark-surface-light'
                                                        }
                            ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                          `}
                                                >
                                                    目標解像度
                                                </button>
                                                <button
                                                    onClick={() => setUpscaleMode('scale')}
                                                    disabled={isProcessing}
                                                    className={`
                            py-2 px-3 rounded-lg text-sm font-medium transition-colors duration-200
                            ${upscaleMode === 'scale'
                                                            ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                                                            : 'bg-dark-bg text-text-secondary hover:bg-dark-surface-light'
                                                        }
                            ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                          `}
                                                >
                                                    倍率指定
                                                </button>
                                            </div>
                                        </div>

                                        {/* Target Resolution Selection */}
                                        {upscaleMode === 'resolution' && (
                                            <div className="pt-4 border-t border-dark-border">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-text-secondary text-sm">目標解像度</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {(() => {
                                                        const inputVideo = items[0]?.videoInfo;
                                                        const availableRes = inputVideo
                                                            ? getAvailableResolutions(inputVideo.width, inputVideo.height)
                                                            : TARGET_RESOLUTIONS.map(r => ({ ...r, scale: 4 as UpscaleScale, outputWidth: r.width, outputHeight: r.height }));

                                                        return availableRes.map((res) => (
                                                            <button
                                                                key={res.shortName}
                                                                onClick={() => {
                                                                    setTargetResolution(res);
                                                                    setUpscaleScale(res.scale);
                                                                }}
                                                                disabled={isProcessing || !ffmpegStatus?.realesrgan_available}
                                                                className={`
                                  py-3 px-3 rounded-lg text-sm font-medium transition-colors duration-200 text-left
                                  ${targetResolution?.shortName === res.shortName
                                                                        ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                                                                        : 'bg-dark-bg text-text-secondary hover:bg-dark-surface-light'
                                                                    }
                                  ${(isProcessing || !ffmpegStatus?.realesrgan_available) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                `}
                                                            >
                                                                <div className="font-bold">{res.shortName}</div>
                                                                <div className="text-xs opacity-80">{res.width}x{res.height}</div>
                                                                <div className="text-xs opacity-60">{res.scale}x拡大</div>
                                                            </button>
                                                        ));
                                                    })()}
                                                </div>
                                                <p className="text-xs text-text-muted mt-2">
                                                    {items[0]?.videoInfo && targetResolution && (
                                                        <>
                                                            {items[0].videoInfo.width}x{items[0].videoInfo.height}
                                                            {' -> '}
                                                            {items[0].videoInfo.width * upscaleScale}x{items[0].videoInfo.height * upscaleScale}
                                                            {' '}({upscaleScale}x)
                                                        </>
                                                    )}
                                                </p>
                                            </div>
                                        )}

                                        {/* Scale Factor Selection */}
                                        {upscaleMode === 'scale' && (
                                            <div className="pt-4 border-t border-dark-border">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-text-secondary text-sm">拡大率</span>
                                                </div>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {([2, 3, 4] as const).map((scale) => (
                                                        <button
                                                            key={scale}
                                                            onClick={() => setUpscaleScale(scale)}
                                                            disabled={isProcessing || !ffmpegStatus?.realesrgan_available}
                                                            className={`
                                py-3 px-3 rounded-lg text-lg font-bold transition-colors duration-200
                                ${upscaleScale === scale
                                                                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                                                                    : 'bg-dark-bg text-text-secondary hover:bg-dark-surface-light'
                                                                }
                                ${(isProcessing || !ffmpegStatus?.realesrgan_available) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                              `}
                                                        >
                                                            {scale}x
                                                        </button>
                                                    ))}
                                                </div>
                                                <p className="text-xs text-text-muted mt-2">
                                                    {items[0]?.videoInfo && (
                                                        <>
                                                            {items[0].videoInfo.width}x{items[0].videoInfo.height}
                                                            {' -> '}
                                                            {items[0].videoInfo.width * upscaleScale}x{items[0].videoInfo.height * upscaleScale}
                                                        </>
                                                    )}
                                                </p>
                                            </div>
                                        )}

                                        {/* Model Selection */}
                                        <div className="pt-4 border-t border-dark-border">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-text-secondary text-sm">AIモデル</span>
                                            </div>
                                            <div className="space-y-2">
                                                <button
                                                    onClick={() => setUpscaleModel('realesrgan-x4plus')}
                                                    disabled={isProcessing || !ffmpegStatus?.realesrgan_available}
                                                    className={`
                            w-full py-3 px-4 rounded-lg text-sm font-medium transition-colors duration-200 text-left
                            ${upscaleModel === 'realesrgan-x4plus'
                                                            ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                                                            : 'bg-dark-bg text-text-secondary hover:bg-dark-surface-light'
                                                        }
                            ${(isProcessing || !ffmpegStatus?.realesrgan_available) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                          `}
                                                >
                                                    <div className="font-semibold">Real-ESRGAN x4plus</div>
                                                    <div className="text-xs opacity-80">汎用モデル - 実写/イラスト両対応</div>
                                                </button>
                                                <button
                                                    onClick={() => setUpscaleModel('realesrgan-x4plus-anime')}
                                                    disabled={isProcessing || !ffmpegStatus?.realesrgan_available}
                                                    className={`
                            w-full py-3 px-4 rounded-lg text-sm font-medium transition-colors duration-200 text-left
                            ${upscaleModel === 'realesrgan-x4plus-anime'
                                                            ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white'
                                                            : 'bg-dark-bg text-text-secondary hover:bg-dark-surface-light'
                                                        }
                            ${(isProcessing || !ffmpegStatus?.realesrgan_available) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                          `}
                                                >
                                                    <div className="font-semibold">Real-ESRGAN x4plus Anime</div>
                                                    <div className="text-xs opacity-80">アニメ/イラスト最適化</div>
                                                </button>
                                                <button
                                                    onClick={() => setUpscaleModel('realesr-animevideov3')}
                                                    disabled={isProcessing || !ffmpegStatus?.realesrgan_available}
                                                    className={`
                            w-full py-3 px-4 rounded-lg text-sm font-medium transition-colors duration-200 text-left
                            ${upscaleModel === 'realesr-animevideov3'
                                                            ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white'
                                                            : 'bg-dark-bg text-text-secondary hover:bg-dark-surface-light'
                                                        }
                            ${(isProcessing || !ffmpegStatus?.realesrgan_available) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                          `}
                                                >
                                                    <div className="font-semibold">RealESR AnimeVideo v3</div>
                                                    <div className="text-xs opacity-80">アニメ動画専用 - 高速処理</div>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Encoding Settings for Upscale */}
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
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Compression Settings - only in Compress mode */}
                        {hasFiles && appMode === 'compress' && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Target Size Selection */}
                                <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
                                    <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M19 14l-7 7m0 0l-7-7m7 7V3"
                                            />
                                        </svg>
                                        圧縮設定
                                    </h2>

                                    <div className="space-y-4">
                                        {/* Target File Size */}
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-text-secondary text-sm">目標ファイルサイズ</span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2">
                                                {FILE_SIZE_PRESETS.map((preset) => (
                                                    <button
                                                        key={preset.sizeMB}
                                                        onClick={() => setTargetSizeMb(preset.sizeMB)}
                                                        disabled={isProcessing}
                                                        className={`
                              py-3 px-3 rounded-lg text-sm font-medium transition-colors duration-200 text-left
                              ${targetSizeMb === preset.sizeMB
                                                                ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white'
                                                                : 'bg-dark-bg text-text-secondary hover:bg-dark-surface-light'
                                                            }
                              ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                                                    >
                                                        <div className="font-bold">{preset.name}</div>
                                                        <div className="text-xs opacity-80">{preset.description}</div>
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Custom Size Input */}
                                            <div className="mt-3">
                                                <label className="text-xs text-text-muted mb-1 block">カスタムサイズ (MB)</label>
                                                <input
                                                    type="number"
                                                    value={targetSizeMb}
                                                    onChange={(e) => setTargetSizeMb(Math.max(1, parseInt(e.target.value) || 1))}
                                                    disabled={isProcessing}
                                                    className="w-full px-3 py-2 rounded-lg bg-dark-bg border border-dark-border text-text-primary
                                     focus:border-orange-500 focus:outline-none transition-colors"
                                                    min="1"
                                                />
                                            </div>

                                            {/* Estimated Bitrate */}
                                            {items[0]?.videoInfo && (
                                                <p className="text-xs text-text-muted mt-2">
                                                    推定ビットレート: {Math.round(calculateTargetBitrate(targetSizeMb, items[0].videoInfo.duration))}kbps
                                                    {' '}(元: {items[0].videoInfo.bitrate ? `${Math.round(items[0].videoInfo.bitrate / 1000)}kbps` : '不明'})
                                                </p>
                                            )}
                                        </div>

                                        {/* Downscale Resolution */}
                                        <div className="pt-4 border-t border-dark-border">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-text-secondary text-sm">解像度</span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2">
                                                {(() => {
                                                    const inputVideo = items[0]?.videoInfo;
                                                    const availableRes = inputVideo
                                                        ? getAvailableDownscaleResolutions(inputVideo.width, inputVideo.height)
                                                        : DOWNSCALE_RESOLUTIONS;

                                                    return availableRes.map((res) => (
                                                        <button
                                                            key={res.shortName}
                                                            onClick={() => setCompressResolution(res)}
                                                            disabled={isProcessing}
                                                            className={`
                                py-2 px-3 rounded-lg text-sm font-medium transition-colors duration-200
                                ${compressResolution.shortName === res.shortName
                                                                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white'
                                                                    : 'bg-dark-bg text-text-secondary hover:bg-dark-surface-light'
                                                                }
                                ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                              `}
                                                        >
                                                            <div className="font-semibold">{res.shortName}</div>
                                                            {res.width > 0 && (
                                                                <div className="text-xs opacity-80">{res.width}x{res.height}</div>
                                                            )}
                                                        </button>
                                                    ));
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Output Settings for Compress */}
                                <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
                                    <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-neon-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                            />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        出力設定
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
                                        </div>

                                        {/* File Size Info */}
                                        {items[0]?.videoInfo && (
                                            <div className="py-4 border-t border-dark-border">
                                                <div className="bg-dark-bg rounded-lg p-4">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-text-secondary text-sm">元のサイズ</span>
                                                        <span className="text-text-primary font-semibold">
                                                            {(items[0].videoInfo.file_size / 1024 / 1024).toFixed(1)} MB
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-text-secondary text-sm">目標サイズ</span>
                                                        <span className="text-orange-400 font-semibold">{targetSizeMb} MB</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-text-secondary text-sm">予想削減率</span>
                                                        <span className="text-success font-semibold">
                                                            {Math.max(0, Math.round((1 - targetSizeMb / (items[0].videoInfo.file_size / 1024 / 1024)) * 100))}%
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Audio Editor - only in Audio mode */}
                        {appMode === 'audio' && (
                            <div className="space-y-6">
                                {/* Audio Drop Zone */}
                                <div
                                    onClick={handleAddAudioFiles}
                                    className={`
                    p-8 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-200
                    ${isAudioProcessing
                                            ? 'border-dark-border bg-dark-surface opacity-50 cursor-not-allowed'
                                            : 'border-dark-border hover:border-green-500 bg-dark-surface hover:bg-dark-surface-light'
                                        }
                  `}
                                >
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                                            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                                                />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-text-primary font-medium">
                                                {audioItems.length > 0 ? `${audioItems.length}ファイル選択済み` : '音声ファイルを選択'}
                                            </p>
                                            <p className="text-text-muted text-sm mt-1">
                                                MP3, WAV, AAC, FLAC, OGG, M4A など
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Audio File List */}
                                {audioItems.length > 0 && (
                                    <div className="bg-dark-surface rounded-xl border border-dark-border overflow-hidden">
                                        <div className="p-4 border-b border-dark-border flex items-center justify-between">
                                            <h3 className="text-text-primary font-medium">音声ファイル ({audioItems.length})</h3>
                                            <button
                                                onClick={handleClearAudioFiles}
                                                disabled={isAudioProcessing}
                                                className="text-text-muted hover:text-red-500 text-sm transition-colors disabled:opacity-50"
                                            >
                                                すべてクリア
                                            </button>
                                        </div>
                                        <div className="divide-y divide-dark-border max-h-64 overflow-y-auto">
                                            {audioItems.map(item => (
                                                <div key={item.id} className="p-4 flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                                                        <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"
                                                            />
                                                        </svg>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-text-primary text-sm truncate">
                                                            {item.audioInfo?.filename || item.inputPath.split('/').pop()}
                                                        </p>
                                                        {item.audioInfo && (
                                                            <p className="text-text-muted text-xs mt-1">
                                                                {item.audioInfo.duration.toFixed(2)}秒 | {item.audioInfo.sample_rate}Hz | {item.audioInfo.channels}ch
                                                            </p>
                                                        )}
                                                        {item.status === 'error' && (
                                                            <p className="text-red-400 text-xs mt-1">{item.error}</p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {item.status === 'loading' && (
                                                            <div className="w-5 h-5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                                                        )}
                                                        {item.status === 'ready' && (
                                                            <span className="text-green-400 text-xs">準備完了</span>
                                                        )}
                                                        {item.status === 'processing' && (
                                                            <span className="text-yellow-400 text-xs">処理中...</span>
                                                        )}
                                                        {item.status === 'completed' && (
                                                            <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        )}
                                                        {item.status === 'error' && (
                                                            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        )}
                                                        <button
                                                            onClick={() => handleRemoveAudioFile(item.id)}
                                                            disabled={isAudioProcessing}
                                                            className="p-1 text-text-muted hover:text-red-500 transition-colors disabled:opacity-50"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                                />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Audio Settings */}
                                {audioItems.length > 0 && (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* Padding Settings */}
                                        <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
                                            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                                                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                                    />
                                                </svg>
                                                捨て尺設定（無音追加）
                                            </h2>
                                            <div className="space-y-6">
                                                {/* Padding Before */}
                                                <div>
                                                    <label className="text-text-secondary text-sm mb-2 block">
                                                        前の無音（秒）
                                                    </label>
                                                    <div className="flex items-center gap-4">
                                                        <input
                                                            type="number"
                                                            value={paddingBefore}
                                                            onChange={(e) => setPaddingBefore(Math.max(0, parseFloat(e.target.value) || 0))}
                                                            step="0.01"
                                                            min="0"
                                                            max="60"
                                                            disabled={isAudioProcessing}
                                                            className="flex-1 px-4 py-3 rounded-lg bg-dark-bg border border-dark-border text-text-primary
                                         focus:border-green-500 focus:outline-none transition-colors text-center text-lg"
                                                        />
                                                        <span className="text-text-muted">秒</span>
                                                    </div>
                                                    <div className="flex gap-2 mt-2">
                                                        {[0, 0.5, 1, 2, 3].map(val => (
                                                            <button
                                                                key={val}
                                                                onClick={() => setPaddingBefore(val)}
                                                                disabled={isAudioProcessing}
                                                                className={`
                                  px-3 py-1 rounded text-sm transition-colors
                                  ${paddingBefore === val
                                                                        ? 'bg-green-500 text-white'
                                                                        : 'bg-dark-bg text-text-secondary hover:bg-dark-surface-light'
                                                                    }
                                  disabled:opacity-50
                                `}
                                                            >
                                                                {val}s
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Padding After */}
                                                <div>
                                                    <label className="text-text-secondary text-sm mb-2 block">
                                                        後の無音（秒）
                                                    </label>
                                                    <div className="flex items-center gap-4">
                                                        <input
                                                            type="number"
                                                            value={paddingAfter}
                                                            onChange={(e) => setPaddingAfter(Math.max(0, parseFloat(e.target.value) || 0))}
                                                            step="0.01"
                                                            min="0"
                                                            max="60"
                                                            disabled={isAudioProcessing}
                                                            className="flex-1 px-4 py-3 rounded-lg bg-dark-bg border border-dark-border text-text-primary
                                         focus:border-green-500 focus:outline-none transition-colors text-center text-lg"
                                                        />
                                                        <span className="text-text-muted">秒</span>
                                                    </div>
                                                    <div className="flex gap-2 mt-2">
                                                        {[0, 0.5, 1, 2, 3].map(val => (
                                                            <button
                                                                key={val}
                                                                onClick={() => setPaddingAfter(val)}
                                                                disabled={isAudioProcessing}
                                                                className={`
                                  px-3 py-1 rounded text-sm transition-colors
                                  ${paddingAfter === val
                                                                        ? 'bg-green-500 text-white'
                                                                        : 'bg-dark-bg text-text-secondary hover:bg-dark-surface-light'
                                                                    }
                                  disabled:opacity-50
                                `}
                                                            >
                                                                {val}s
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Duration Preview */}
                                                {audioItems[0]?.audioInfo && (
                                                    <div className="pt-4 border-t border-dark-border">
                                                        <div className="bg-dark-bg rounded-lg p-4">
                                                            <div className="flex justify-between items-center mb-2">
                                                                <span className="text-text-secondary text-sm">元の長さ</span>
                                                                <span className="text-text-primary font-mono">{audioItems[0].audioInfo.duration.toFixed(2)}秒</span>
                                                            </div>
                                                            <div className="flex justify-between items-center mb-2">
                                                                <span className="text-text-secondary text-sm">追加される無音</span>
                                                                <span className="text-green-400 font-mono">+{(paddingBefore + paddingAfter).toFixed(2)}秒</span>
                                                            </div>
                                                            <div className="flex justify-between items-center pt-2 border-t border-dark-border">
                                                                <span className="text-text-secondary text-sm font-medium">出力後の長さ</span>
                                                                <span className="text-text-primary font-mono font-bold">
                                                                    {(audioItems[0].audioInfo.duration + paddingBefore + paddingAfter).toFixed(2)}秒
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Output Settings */}
                                        <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
                                            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                                                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                                    />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                                出力設定
                                            </h2>
                                            <div className="space-y-4">
                                                {/* Output Format */}
                                                <div>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-text-secondary text-sm">出力形式</span>
                                                    </div>
                                                    <div className="grid grid-cols-5 gap-2">
                                                        {(['wav', 'mp3', 'aac', 'flac', 'ogg'] as AudioOutputFormat[]).map((format) => (
                                                            <button
                                                                key={format}
                                                                onClick={() => setAudioOutputFormat(format)}
                                                                disabled={isAudioProcessing}
                                                                className={`
                                  py-2 px-3 rounded-lg text-sm font-medium transition-colors duration-200 uppercase
                                  ${audioOutputFormat === format
                                                                        ? 'bg-green-500 text-white'
                                                                        : 'bg-dark-bg text-text-secondary hover:bg-dark-surface-light'
                                                                    }
                                  ${isAudioProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                `}
                                                            >
                                                                {format}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <p className="text-xs text-text-muted mt-2">
                                                        {audioOutputFormat === 'wav' && 'WAV - 非圧縮、最高品質、大容量'}
                                                        {audioOutputFormat === 'mp3' && 'MP3 - 圧縮、高い互換性'}
                                                        {audioOutputFormat === 'aac' && 'AAC - 高効率圧縮、Apple推奨'}
                                                        {audioOutputFormat === 'flac' && 'FLAC - 可逆圧縮、ロスレス'}
                                                        {audioOutputFormat === 'ogg' && 'OGG Vorbis - オープンソース圧縮'}
                                                    </p>
                                                </div>

                                                {/* Quality Setting */}
                                                <div className="pt-4 border-t border-dark-border">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-text-secondary text-sm">品質</span>
                                                    </div>
                                                    <div className="grid grid-cols-4 gap-2">
                                                        {(['low', 'medium', 'high', 'lossless'] as AudioQuality[]).map((quality) => (
                                                            <button
                                                                key={quality}
                                                                onClick={() => setAudioQuality(quality)}
                                                                disabled={isAudioProcessing}
                                                                className={`
                                  py-2 px-3 rounded-lg text-sm font-medium transition-colors duration-200
                                  ${audioQuality === quality
                                                                        ? 'bg-green-500 text-white'
                                                                        : 'bg-dark-bg text-text-secondary hover:bg-dark-surface-light'
                                                                    }
                                  ${isAudioProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                `}
                                                            >
                                                                {quality === 'low' && '低'}
                                                                {quality === 'medium' && '中'}
                                                                {quality === 'high' && '高'}
                                                                {quality === 'lossless' && '最高'}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <p className="text-xs text-text-muted mt-2">
                                                        {audioQuality === 'low' && '低品質 - 小さいファイルサイズ (128kbps)'}
                                                        {audioQuality === 'medium' && '中品質 - バランス (192kbps)'}
                                                        {audioQuality === 'high' && '高品質 - 高音質 (320kbps)'}
                                                        {audioQuality === 'lossless' && '最高品質 - ロスレス / 最高ビットレート'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Audio Progress */}
                                {isAudioProcessing && audioProgress && (
                                    <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="text-text-primary font-medium">処理中...</span>
                                            <span className="text-green-400 font-mono">{audioProgress.progress.toFixed(1)}%</span>
                                        </div>
                                        <div className="w-full bg-dark-bg rounded-full h-2 overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-green-500 to-teal-500 transition-all duration-300"
                                                style={{ width: `${audioProgress.progress}%` }}
                                            />
                                        </div>
                                        <p className="text-text-muted text-sm mt-2">{audioProgress.time}</p>
                                    </div>
                                )}

                                {/* Audio Action Buttons */}
                                {audioItems.length > 0 && (
                                    <div className="flex gap-4">
                                        {audioItems.every(i => i.status === 'completed' || i.status === 'error') ? (
                                            <button
                                                onClick={handleResetAudio}
                                                className="flex-1 py-4 px-6 rounded-xl font-semibold text-lg
                                   bg-dark-surface-light text-text-primary border border-dark-border
                                   hover:border-green-500/50 transition-all duration-300
                                   flex items-center justify-center gap-3"
                                            >
                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                                    />
                                                </svg>
                                                新しい処理
                                            </button>
                                        ) : isAudioProcessing ? (
                                            <button
                                                onClick={() => setIsAudioProcessing(false)}
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
                                                    onClick={handleClearAudioFiles}
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
                                                    onClick={handleStartAudioProcessing}
                                                    disabled={audioItems.every(i => i.status !== 'ready')}
                                                    className={`flex-1 py-4 px-6 rounded-xl font-semibold text-lg
                                     flex items-center justify-center gap-3 transition-all duration-300
                                     ${audioItems.some(i => i.status === 'ready')
                                                            ? 'bg-gradient-to-r from-green-500 to-teal-500 text-white hover:opacity-90 shadow-lg shadow-green-500/20'
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
                                                    音声処理開始 ({audioItems.filter(i => i.status === 'ready').length}ファイル)
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Empty State for Audio */}
                                {audioItems.length === 0 && ffmpegStatus?.available && (
                                    <div className="text-center py-8">
                                        <p className="text-text-muted">
                                            音声ファイルを選択して、前後に無音（捨て尺）を追加しましょう
                                        </p>
                                        <p className="text-text-muted text-sm mt-2">
                                            0.01秒単位で細かく調整できます
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Media Info Viewer - only in Info mode */}
                        {appMode === 'info' && (
                            <div className="space-y-6">
                                {/* File Select/Drop Zone */}
                                <div
                                    onClick={handleSelectMediaFile}
                                    onDragOver={handleInfoDragOver}
                                    onDragLeave={handleInfoDragLeave}
                                    onDrop={handleInfoDrop}
                                    className={`
                    p-8 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-200
                    ${isLoadingInfo
                                            ? 'border-dark-border bg-dark-surface opacity-50 cursor-wait'
                                            : isDraggingInfo
                                                ? 'border-indigo-500 bg-indigo-500/10 scale-[1.02]'
                                                : 'border-dark-border hover:border-indigo-500 bg-dark-surface hover:bg-dark-surface-light'
                                        }
                  `}
                                >
                                    <div className="flex flex-col items-center gap-4">
                                        <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${isDraggingInfo ? 'bg-indigo-500/20' : 'bg-indigo-500/10'}`}>
                                            {isLoadingInfo ? (
                                                <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                            ) : isDraggingInfo ? (
                                                <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                        d="M19 14l-7 7m0 0l-7-7m7 7V3"
                                                    />
                                                </svg>
                                            ) : (
                                                <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                                    />
                                                </svg>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-text-primary font-medium">
                                                {isLoadingInfo ? '読み込み中...' : isDraggingInfo ? 'ここにドロップ' : mediaInfo ? mediaInfo.filename : 'クリックまたはドロップで選択'}
                                            </p>
                                            <p className="text-text-muted text-sm mt-1">
                                                動画・音声ファイルの詳細情報を表示
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Error Display */}
                                {infoError && (
                                    <div className="p-4 bg-error/10 border border-error/30 rounded-xl">
                                        <p className="text-error text-sm">{infoError}</p>
                                    </div>
                                )}

                                {/* Media Info Display */}
                                {mediaInfo && (
                                    <div className="space-y-4">
                                        {/* Thumbnail and Basic Info */}
                                        <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
                                            <div className="flex gap-6">
                                                {/* Thumbnail */}
                                                {mediaInfo.thumbnail && (
                                                    <div className="flex-shrink-0">
                                                        <img
                                                            src={mediaInfo.thumbnail}
                                                            alt="Thumbnail"
                                                            className="w-48 h-auto rounded-lg object-cover"
                                                        />
                                                    </div>
                                                )}
                                                {/* Basic Info */}
                                                <div className="flex-1 space-y-3">
                                                    <h2 className="text-lg font-semibold text-text-primary truncate">
                                                        {mediaInfo.filename}
                                                    </h2>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <span className="text-text-muted text-xs">フォーマット</span>
                                                            <p className="text-text-primary font-medium">{mediaInfo.format_long_name}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-text-muted text-xs">ファイルサイズ</span>
                                                            <p className="text-text-primary font-medium">{formatFileSize(mediaInfo.file_size)}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-text-muted text-xs">総尺</span>
                                                            <p className="text-text-primary font-medium">{formatDuration(mediaInfo.duration)}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-text-muted text-xs">ビットレート</span>
                                                            <p className="text-text-primary font-medium">{formatBitrate(mediaInfo.bitrate ?? null)}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Video Stream Info */}
                                        {mediaInfo.video_codec && (
                                            <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
                                                <h3 className="text-md font-semibold text-text-primary mb-4 flex items-center gap-2">
                                                    <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                                        />
                                                    </svg>
                                                    映像ストリーム
                                                </h3>
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                    <div className="bg-dark-bg rounded-lg p-3">
                                                        <span className="text-text-muted text-xs block">コーデック</span>
                                                        <p className="text-text-primary font-mono text-sm">{mediaInfo.video_codec}</p>
                                                        {mediaInfo.video_profile && (
                                                            <p className="text-text-muted text-xs">{mediaInfo.video_profile}</p>
                                                        )}
                                                    </div>
                                                    <div className="bg-dark-bg rounded-lg p-3">
                                                        <span className="text-text-muted text-xs block">解像度</span>
                                                        <p className="text-text-primary font-mono text-sm">{mediaInfo.width}x{mediaInfo.height}</p>
                                                        {mediaInfo.aspect_ratio && (
                                                            <p className="text-text-muted text-xs">アスペクト比: {mediaInfo.aspect_ratio}</p>
                                                        )}
                                                    </div>
                                                    <div className="bg-dark-bg rounded-lg p-3">
                                                        <span className="text-text-muted text-xs block">フレームレート</span>
                                                        <p className="text-text-primary font-mono text-sm">{mediaInfo.fps?.toFixed(2)} fps</p>
                                                    </div>
                                                    <div className="bg-dark-bg rounded-lg p-3">
                                                        <span className="text-text-muted text-xs block">ビットレート</span>
                                                        <p className="text-text-primary font-mono text-sm">{formatBitrate(mediaInfo.video_bitrate ?? null)}</p>
                                                    </div>
                                                    <div className="bg-dark-bg rounded-lg p-3">
                                                        <span className="text-text-muted text-xs block">ピクセル形式</span>
                                                        <p className="text-text-primary font-mono text-sm">{mediaInfo.pixel_format || '不明'}</p>
                                                    </div>
                                                    {mediaInfo.color_space && (
                                                        <div className="bg-dark-bg rounded-lg p-3">
                                                            <span className="text-text-muted text-xs block">色空間</span>
                                                            <p className="text-text-primary font-mono text-sm">{mediaInfo.color_space}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Audio Stream Info */}
                                        {mediaInfo.audio_codec && (
                                            <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
                                                <h3 className="text-md font-semibold text-text-primary mb-4 flex items-center gap-2">
                                                    <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                                                        />
                                                    </svg>
                                                    音声ストリーム
                                                </h3>
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                    <div className="bg-dark-bg rounded-lg p-3">
                                                        <span className="text-text-muted text-xs block">コーデック</span>
                                                        <p className="text-text-primary font-mono text-sm">{mediaInfo.audio_codec}</p>
                                                        {mediaInfo.audio_profile && (
                                                            <p className="text-text-muted text-xs">{mediaInfo.audio_profile}</p>
                                                        )}
                                                    </div>
                                                    <div className="bg-dark-bg rounded-lg p-3">
                                                        <span className="text-text-muted text-xs block">サンプルレート</span>
                                                        <p className="text-text-primary font-mono text-sm">{mediaInfo.sample_rate ? `${mediaInfo.sample_rate} Hz` : '不明'}</p>
                                                    </div>
                                                    <div className="bg-dark-bg rounded-lg p-3">
                                                        <span className="text-text-muted text-xs block">チャンネル</span>
                                                        <p className="text-text-primary font-mono text-sm">
                                                            {mediaInfo.channels}ch {mediaInfo.channel_layout ? `(${mediaInfo.channel_layout})` : ''}
                                                        </p>
                                                    </div>
                                                    <div className="bg-dark-bg rounded-lg p-3">
                                                        <span className="text-text-muted text-xs block">ビットレート</span>
                                                        <p className="text-text-primary font-mono text-sm">{formatBitrate(mediaInfo.audio_bitrate ?? null)}</p>
                                                    </div>
                                                    {mediaInfo.bits_per_sample && (
                                                        <div className="bg-dark-bg rounded-lg p-3">
                                                            <span className="text-text-muted text-xs block">ビット深度</span>
                                                            <p className="text-text-primary font-mono text-sm">{mediaInfo.bits_per_sample} bit</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Metadata */}
                                        {(mediaInfo.title || mediaInfo.artist || mediaInfo.album || mediaInfo.encoder || mediaInfo.creation_time) && (
                                            <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
                                                <h3 className="text-md font-semibold text-text-primary mb-4 flex items-center gap-2">
                                                    <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                                                        />
                                                    </svg>
                                                    メタデータ
                                                </h3>
                                                <div className="grid grid-cols-2 gap-4">
                                                    {mediaInfo.title && (
                                                        <div className="bg-dark-bg rounded-lg p-3">
                                                            <span className="text-text-muted text-xs block">タイトル</span>
                                                            <p className="text-text-primary text-sm">{mediaInfo.title}</p>
                                                        </div>
                                                    )}
                                                    {mediaInfo.artist && (
                                                        <div className="bg-dark-bg rounded-lg p-3">
                                                            <span className="text-text-muted text-xs block">アーティスト</span>
                                                            <p className="text-text-primary text-sm">{mediaInfo.artist}</p>
                                                        </div>
                                                    )}
                                                    {mediaInfo.album && (
                                                        <div className="bg-dark-bg rounded-lg p-3">
                                                            <span className="text-text-muted text-xs block">アルバム</span>
                                                            <p className="text-text-primary text-sm">{mediaInfo.album}</p>
                                                        </div>
                                                    )}
                                                    {mediaInfo.date && (
                                                        <div className="bg-dark-bg rounded-lg p-3">
                                                            <span className="text-text-muted text-xs block">日付</span>
                                                            <p className="text-text-primary text-sm">{mediaInfo.date}</p>
                                                        </div>
                                                    )}
                                                    {mediaInfo.encoder && (
                                                        <div className="bg-dark-bg rounded-lg p-3">
                                                            <span className="text-text-muted text-xs block">エンコーダー</span>
                                                            <p className="text-text-primary text-sm">{mediaInfo.encoder}</p>
                                                        </div>
                                                    )}
                                                    {mediaInfo.creation_time && (
                                                        <div className="bg-dark-bg rounded-lg p-3">
                                                            <span className="text-text-muted text-xs block">作成日時</span>
                                                            <p className="text-text-primary text-sm">{mediaInfo.creation_time}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* File Path */}
                                        <div className="bg-dark-surface rounded-xl p-4 border border-dark-border">
                                            <span className="text-text-muted text-xs block mb-1">ファイルパス</span>
                                            <p className="text-text-primary text-sm font-mono break-all">{mediaInfo.path}</p>
                                        </div>

                                        {/* Clear Button */}
                                        <button
                                            onClick={handleClearMediaInfo}
                                            className="w-full py-3 px-6 rounded-xl font-semibold
                               bg-dark-surface-light text-text-secondary border border-dark-border
                               hover:border-indigo-500/50 hover:text-indigo-400 transition-all duration-300
                               flex items-center justify-center gap-2"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                />
                                            </svg>
                                            クリア
                                        </button>
                                    </div>
                                )}

                                {/* Empty State for Info */}
                                {!mediaInfo && !isLoadingInfo && !infoError && ffmpegStatus?.available && (
                                    <div className="text-center py-8">
                                        <p className="text-text-muted">
                                            動画や音声ファイルを選択して、詳細情報を確認しましょう
                                        </p>
                                        <p className="text-text-muted text-sm mt-2">
                                            コーデック、ビットレート、解像度、メタデータなどを表示します
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Batch Progress - for video modes only */}
                        {appMode !== 'audio' && appMode !== 'info' && (
                            <BatchProgress
                                progress={batchProgress}
                                isProcessing={isProcessing}
                            />
                        )}

                        {/* Action Buttons - for video modes only */}
                        {appMode !== 'audio' && appMode !== 'info' && hasFiles && (
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
                                            {appMode === 'fps' && 'バッチ変換開始'}
                                            {appMode === 'upscale' && 'バッチ高画質化開始'}
                                            {appMode === 'compress' && 'バッチ圧縮開始'}
                                            {' '}({readyFiles.length}ファイル)
                                        </button>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Empty State - for video modes only */}
                        {appMode !== 'audio' && appMode !== 'info' && !hasFiles && ffmpegStatus?.available && (
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

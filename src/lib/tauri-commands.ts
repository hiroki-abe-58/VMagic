import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import type { VideoInfo, FFmpegStatus, ConversionResult, ProgressEvent } from '../types/video';

// Check if ffmpeg is available
export async function checkFfmpeg(): Promise<FFmpegStatus> {
    return invoke<FFmpegStatus>('check_ffmpeg');
}

// Get video information
export async function getVideoInfo(path: string): Promise<VideoInfo> {
    return invoke<VideoInfo>('get_video_info', { path });
}

// Convert video with minterpolate
export async function convertVideo(
  inputPath: string,
  outputPath: string,
  targetFps: number,
  useHwAccel: boolean = true,
  useHevc: boolean = false,
  qualityPreset: string = 'balanced'
): Promise<ConversionResult> {
  return invoke<ConversionResult>('convert_video', {
    inputPath,
    outputPath,
    targetFps,
    useHwAccel,
    useHevc,
    qualityPreset,
  });
}

// Cancel ongoing conversion
export async function cancelConversion(): Promise<void> {
    return invoke<void>('cancel_conversion');
}

// Subscribe to conversion progress events
export async function subscribeToProgress(
    callback: (event: ProgressEvent) => void
): Promise<UnlistenFn> {
    return listen<ProgressEvent>('conversion-progress', (event) => {
        callback(event.payload);
    });
}

// Open file dialog for video selection
export async function selectVideoFile(): Promise<string | null> {
    const result = await open({
        multiple: false,
        filters: [
            {
                name: '動画ファイル',
                extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'm4v', 'wmv', 'mpg', 'mpeg'],
            },
        ],
    });

    if (typeof result === 'string') {
        return result;
    }
    return null;
}

// Open directory dialog for output selection
export async function selectOutputDirectory(): Promise<string | null> {
    const result = await open({
        directory: true,
        multiple: false,
    });

    if (typeof result === 'string') {
        return result;
    }
    return null;
}

// Open save dialog for output file
export async function selectOutputFile(defaultName: string): Promise<string | null> {
    const result = await save({
        defaultPath: defaultName,
        filters: [
            {
                name: '動画ファイル',
                extensions: ['mp4'],
            },
        ],
    });

    return result;
}

// Format file size
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Format duration to HH:MM:SS
export function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`;
}

// Format bitrate
export function formatBitrate(bps: number | null): string {
    if (!bps) return '不明';

    if (bps >= 1000000) {
        return `${(bps / 1000000).toFixed(2)} Mbps`;
    }
    return `${(bps / 1000).toFixed(2)} Kbps`;
}


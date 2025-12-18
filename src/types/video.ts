// Video information returned from ffprobe
export interface VideoInfo {
    path: string;
    filename: string;
    duration: number;
    fps: number;
    width: number;
    height: number;
    codec: string;
    bitrate: number | null;
    file_size: number;
    thumbnail: string | null; // Base64 encoded JPEG thumbnail
}

// FFmpeg availability status
export interface FFmpegStatus {
    available: boolean;
    ffmpeg_path: string | null;
    ffprobe_path: string | null;
    version: string | null;
    videotoolbox_available: boolean;
    hevc_available: boolean;
    rife_available: boolean;
    rife_path: string | null;
    realesrgan_available: boolean;
    realesrgan_path: string | null;
}

// Quality preset options
export type QualityPreset = 'fast' | 'balanced' | 'quality';

// Interpolation method options
export type InterpolationMethod = 'minterpolate' | 'framerate' | 'duplicate' | 'rife';

// Output format options
export type OutputFormat = 'mp4' | 'mov' | 'webm' | 'mkv';

// Upscale model options
export type UpscaleModel = 'realesrgan-x4plus' | 'realesrgan-x4plus-anime' | 'realesr-animevideov3';

// Upscale scale factor
export type UpscaleScale = 2 | 3 | 4;

// Target resolution presets
export interface TargetResolution {
    name: string;
    width: number;
    height: number;
    shortName: string;
}

export const TARGET_RESOLUTIONS: TargetResolution[] = [
    { name: 'HD (720p)', width: 1280, height: 720, shortName: '720p' },
    { name: 'Full HD (1080p)', width: 1920, height: 1080, shortName: 'FHD' },
    { name: '2K (1440p)', width: 2560, height: 1440, shortName: '2K' },
    { name: '4K UHD', width: 3840, height: 2160, shortName: '4K' },
    { name: '5K', width: 5120, height: 2880, shortName: '5K' },
    { name: '8K UHD', width: 7680, height: 4320, shortName: '8K' },
];

// Calculate required scale factor for target resolution
export function calculateScaleFactor(
    inputWidth: number,
    inputHeight: number,
    targetWidth: number,
    targetHeight: number
): UpscaleScale | null {
    const scaleX = targetWidth / inputWidth;
    const scaleY = targetHeight / inputHeight;
    const requiredScale = Math.max(scaleX, scaleY);

    // If input is already larger than target, no upscaling needed
    if (requiredScale <= 1) {
        return null;
    }

    // Round up to nearest supported scale (2, 3, or 4)
    if (requiredScale <= 2) return 2;
    if (requiredScale <= 3) return 3;
    if (requiredScale <= 4) return 4;

    // If scale > 4, we need multiple passes (not supported yet)
    return 4;
}

// Get available target resolutions based on input size
export function getAvailableResolutions(
    inputWidth: number,
    inputHeight: number
): (TargetResolution & { scale: UpscaleScale; outputWidth: number; outputHeight: number })[] {
    return TARGET_RESOLUTIONS
        .map(res => {
            const scale = calculateScaleFactor(inputWidth, inputHeight, res.width, res.height);
            if (!scale) return null;
            return {
                ...res,
                scale,
                outputWidth: inputWidth * scale,
                outputHeight: inputHeight * scale,
            };
        })
        .filter((res): res is NonNullable<typeof res> => res !== null);
}

// ============================================
// Compression / Downscale Settings
// ============================================

// Target file size presets (in MB)
export interface FileSizePreset {
    name: string;
    sizeMB: number;
    description: string;
}

export const FILE_SIZE_PRESETS: FileSizePreset[] = [
    { name: '8MB', sizeMB: 8, description: 'Discord無料' },
    { name: '25MB', sizeMB: 25, description: 'Discord Nitro / メール添付' },
    { name: '50MB', sizeMB: 50, description: 'Discord Nitro Basic' },
    { name: '100MB', sizeMB: 100, description: '一般的なアップロード' },
    { name: '500MB', sizeMB: 500, description: '大容量' },
];

// Downscale resolution presets
export interface DownscaleResolution {
    name: string;
    width: number;
    height: number;
    shortName: string;
}

export const DOWNSCALE_RESOLUTIONS: DownscaleResolution[] = [
    { name: '元のサイズ', width: 0, height: 0, shortName: 'Original' },
    { name: '4K UHD', width: 3840, height: 2160, shortName: '4K' },
    { name: 'Full HD (1080p)', width: 1920, height: 1080, shortName: 'FHD' },
    { name: 'HD (720p)', width: 1280, height: 720, shortName: '720p' },
    { name: 'SD (480p)', width: 854, height: 480, shortName: '480p' },
    { name: '360p', width: 640, height: 360, shortName: '360p' },
];

// Get available downscale resolutions (only smaller than input)
export function getAvailableDownscaleResolutions(
    inputWidth: number,
    inputHeight: number
): DownscaleResolution[] {
    return DOWNSCALE_RESOLUTIONS.filter(res => {
        if (res.width === 0) return true; // Always include "Original"
        return res.width < inputWidth || res.height < inputHeight;
    });
}

// Calculate target bitrate for desired file size
export function calculateTargetBitrate(
    targetSizeMB: number,
    durationSeconds: number,
    audioBitrateKbps: number = 128
): number {
    // Target size in bits
    const targetBits = targetSizeMB * 8 * 1024 * 1024;
    // Audio bits
    const audioBits = audioBitrateKbps * 1000 * durationSeconds;
    // Video bits (target - audio)
    const videoBits = Math.max(targetBits - audioBits, targetBits * 0.8);
    // Video bitrate in kbps
    const videoBitrateKbps = Math.floor(videoBits / durationSeconds / 1000);
    return Math.max(videoBitrateKbps, 100); // Minimum 100kbps
}

// Estimate output file size
export function estimateFileSize(
    videoBitrateKbps: number,
    audioBitrateKbps: number,
    durationSeconds: number
): number {
    const totalBits = (videoBitrateKbps + audioBitrateKbps) * 1000 * durationSeconds;
    return totalBits / 8 / 1024 / 1024; // Return in MB
}

// Conversion progress event
export interface ProgressEvent {
    progress: number;
    frame: number;
    fps: number;
    time: string;
    speed: string;
}

// Conversion result
export interface ConversionResult {
    success: boolean;
    output_path: string;
    input_duration: number;
    output_duration: number;
    duration_diff: number;
    duration_valid: boolean;
    message: string;
}

// FPS preset
export interface FpsPreset {
    label: string;
    value: number;
    description: string;
}

// App state
export type ConversionStatus =
    | 'idle'
    | 'loading'
    | 'ready'
    | 'converting'
    | 'completed'
    | 'error'
    | 'cancelled';

// Batch processing types
export type BatchItemStatus =
    | 'pending'
    | 'loading'
    | 'ready'
    | 'converting'
    | 'completed'
    | 'error'
    | 'cancelled';

export interface BatchItem {
    id: string;
    inputPath: string;
    outputPath: string;
    videoInfo: VideoInfo | null;
    status: BatchItemStatus;
    progress: ProgressEvent | null;
    result: ConversionResult | null;
    error: string | null;
}

export interface BatchProgress {
    totalFiles: number;
    completedFiles: number;
    currentFileIndex: number;
    currentFileName: string;
    overallProgress: number;
}

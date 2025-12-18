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
}

// Quality preset options
export type QualityPreset = 'fast' | 'balanced' | 'quality';

// Interpolation method options
export type InterpolationMethod = 'minterpolate' | 'framerate' | 'duplicate';

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

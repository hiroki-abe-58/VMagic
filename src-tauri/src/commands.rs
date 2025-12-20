use crate::ffmpeg::{self, AudioInfo, MediaDetailInfo, VideoInfo};
use crate::validation;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

// Global state for cancellation
pub struct ConversionState {
    pub cancel_flag: Arc<AtomicBool>,
    pub is_converting: Arc<Mutex<bool>>,
}

impl Default for ConversionState {
    fn default() -> Self {
        Self {
            cancel_flag: Arc::new(AtomicBool::new(false)),
            is_converting: Arc::new(Mutex::new(false)),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FFmpegStatus {
    pub available: bool,
    pub ffmpeg_path: Option<String>,
    pub ffprobe_path: Option<String>,
    pub version: Option<String>,
    pub videotoolbox_available: bool,
    pub hevc_available: bool,
    pub rife_available: bool,
    pub rife_path: Option<String>,
    pub realesrgan_available: bool,
    pub realesrgan_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConversionResult {
    pub success: bool,
    pub output_path: String,
    pub input_duration: f64,
    pub output_duration: f64,
    pub duration_diff: f64,
    pub duration_valid: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProgressEvent {
    pub progress: f64,
    pub frame: u64,
    pub fps: f64,
    pub time: String,
    pub speed: String,
}

/// Check if ffmpeg and ffprobe are available
#[tauri::command]
pub async fn check_ffmpeg() -> Result<FFmpegStatus, String> {
    ffmpeg::check_ffmpeg_availability().await
}

/// Get video information using ffprobe
#[tauri::command]
pub async fn get_video_info(path: String) -> Result<VideoInfo, String> {
    ffmpeg::get_video_info(&path).await
}

/// Convert video with specified interpolation method
#[tauri::command]
pub async fn convert_video(
    app: AppHandle,
    input_path: String,
    output_path: String,
    target_fps: f64,
    use_hw_accel: Option<bool>,
    use_hevc: Option<bool>,
    quality_preset: Option<String>,
    interpolation_method: Option<String>,
    output_format: Option<String>,
    state: State<'_, ConversionState>,
) -> Result<ConversionResult, String> {
    // Check if already converting
    {
        let mut is_converting = state.is_converting.lock().await;
        if *is_converting {
            return Err("変換処理が既に実行中です".to_string());
        }
        *is_converting = true;
    }

    // Reset cancel flag
    state.cancel_flag.store(false, Ordering::SeqCst);

    let cancel_flag = state.cancel_flag.clone();
    let is_converting = state.is_converting.clone();

    // Get input video info for duration validation
    let input_info = ffmpeg::get_video_info(&input_path).await?;
    let input_duration = input_info.duration;

    // Determine output path with correct extension
    let final_output_path = if use_hevc.unwrap_or(false) && output_path.ends_with(".mp4") {
        // HEVC can use .mp4 container, but let's keep it
        output_path.clone()
    } else {
        output_path.clone()
    };

    // Run conversion based on interpolation method
    let method = interpolation_method.as_deref().unwrap_or("minterpolate");
    let format = output_format.as_deref().unwrap_or("mp4");
    
    let result = if method == "rife" {
        // Use RIFE AI interpolation
        ffmpeg::convert_video_rife(
            &input_path,
            &final_output_path,
            target_fps,
            input_info.fps,
            input_duration,
            use_hw_accel.unwrap_or(true),
            use_hevc.unwrap_or(false),
            quality_preset.as_deref(),
            format,
            cancel_flag,
            move |progress| {
                let _ = app.emit("conversion-progress", progress);
            },
        )
        .await
    } else {
        // Use ffmpeg filters
        ffmpeg::convert_video_minterpolate(
            &input_path,
            &final_output_path,
            target_fps,
            input_duration,
            use_hw_accel.unwrap_or(true),
            use_hevc.unwrap_or(false),
            quality_preset.as_deref(),
            interpolation_method.as_deref(),
            format,
            cancel_flag,
            move |progress| {
                let _ = app.emit("conversion-progress", progress);
            },
        )
        .await
    };

    // Reset converting flag
    {
        let mut converting = is_converting.lock().await;
        *converting = false;
    }

    match result {
        Ok(output_duration) => {
            // Validate duration
            let (duration_valid, duration_diff) =
                validation::validate_duration(input_duration, output_duration);

            let message = if duration_valid {
                format!(
                    "変換完了: 入力 {:.2}秒 -> 出力 {:.2}秒 (差: {:.3}秒)",
                    input_duration, output_duration, duration_diff.abs()
                )
            } else {
                format!(
                    "警告: 総尺が許容範囲を超えて変化しました。入力 {:.2}秒 -> 出力 {:.2}秒 (差: {:.3}秒)",
                    input_duration, output_duration, duration_diff.abs()
                )
            };

            Ok(ConversionResult {
                success: true,
                output_path,
                input_duration,
                output_duration,
                duration_diff,
                duration_valid,
                message,
            })
        }
        Err(e) => {
            if e.contains("cancelled") || e.contains("キャンセル") {
                Ok(ConversionResult {
                    success: false,
                    output_path,
                    input_duration,
                    output_duration: 0.0,
                    duration_diff: 0.0,
                    duration_valid: false,
                    message: "変換がキャンセルされました".to_string(),
                })
            } else {
                Err(e)
            }
        }
    }
}

/// Cancel ongoing conversion
#[tauri::command]
pub async fn cancel_conversion(state: State<'_, ConversionState>) -> Result<(), String> {
    state.cancel_flag.store(true, Ordering::SeqCst);
    Ok(())
}

/// Upscale video using Real-ESRGAN AI
#[tauri::command]
pub async fn upscale_video(
    app: AppHandle,
    input_path: String,
    output_path: String,
    scale_factor: u32,
    model_name: String,
    use_hw_accel: Option<bool>,
    use_hevc: Option<bool>,
    quality_preset: Option<String>,
    output_format: Option<String>,
    state: State<'_, ConversionState>,
) -> Result<ConversionResult, String> {
    // Check if already converting
    {
        let mut is_converting = state.is_converting.lock().await;
        if *is_converting {
            return Err("変換処理が既に実行中です".to_string());
        }
        *is_converting = true;
    }

    // Reset cancel flag
    state.cancel_flag.store(false, Ordering::SeqCst);

    let cancel_flag = state.cancel_flag.clone();
    let is_converting = state.is_converting.clone();

    // Get input video info
    let input_info = ffmpeg::get_video_info(&input_path).await?;
    let input_duration = input_info.duration;

    let format = output_format.as_deref().unwrap_or("mp4");

    // Run upscale
    let result = ffmpeg::upscale_video_realesrgan(
        &input_path,
        &output_path,
        scale_factor,
        &model_name,
        use_hw_accel.unwrap_or(true),
        use_hevc.unwrap_or(false),
        quality_preset.as_deref(),
        format,
        cancel_flag,
        move |progress| {
            let _ = app.emit("conversion-progress", progress);
        },
    )
    .await;

    // Reset converting flag
    {
        let mut converting = is_converting.lock().await;
        *converting = false;
    }

    match result {
        Ok(()) => {
            // Get output info for validation
            let output_info = ffmpeg::get_video_info(&output_path).await?;
            let output_duration = output_info.duration;
            let duration_diff = (output_duration - input_duration).abs();

            let message = format!(
                "アップスケール完了: {}x{} -> {}x{} ({}x)",
                input_info.width, input_info.height,
                output_info.width, output_info.height,
                scale_factor
            );

            Ok(ConversionResult {
                success: true,
                output_path,
                input_duration,
                output_duration,
                duration_diff,
                duration_valid: duration_diff < 0.5,
                message,
            })
        }
        Err(e) => {
            if e.contains("cancelled") || e.contains("キャンセル") {
                Ok(ConversionResult {
                    success: false,
                    output_path,
                    input_duration,
                    output_duration: 0.0,
                    duration_diff: 0.0,
                    duration_valid: false,
                    message: "アップスケールがキャンセルされました".to_string(),
                })
            } else {
                Err(e)
            }
        }
    }
}

/// Compress video to target file size
#[tauri::command]
pub async fn compress_video(
    app: AppHandle,
    input_path: String,
    output_path: String,
    target_size_mb: f64,
    target_width: Option<u32>,
    target_height: Option<u32>,
    use_hw_accel: Option<bool>,
    output_format: Option<String>,
    state: State<'_, ConversionState>,
) -> Result<ConversionResult, String> {
    // Check if already converting
    {
        let mut is_converting = state.is_converting.lock().await;
        if *is_converting {
            return Err("変換処理が既に実行中です".to_string());
        }
        *is_converting = true;
    }

    // Reset cancel flag
    state.cancel_flag.store(false, Ordering::SeqCst);

    let cancel_flag = state.cancel_flag.clone();
    let is_converting = state.is_converting.clone();

    // Get input video info
    let input_info = ffmpeg::get_video_info(&input_path).await?;
    let input_duration = input_info.duration;
    let input_size = input_info.file_size;

    let format = output_format.as_deref().unwrap_or("mp4");

    // Run compression
    let result = ffmpeg::compress_video(
        &input_path,
        &output_path,
        target_size_mb,
        target_width,
        target_height,
        use_hw_accel.unwrap_or(true),
        format,
        cancel_flag,
        move |progress| {
            let _ = app.emit("conversion-progress", progress);
        },
    )
    .await;

    // Reset converting flag
    {
        let mut converting = is_converting.lock().await;
        *converting = false;
    }

    match result {
        Ok(output_size) => {
            let output_info = ffmpeg::get_video_info(&output_path).await?;
            let output_duration = output_info.duration;
            let duration_diff = (output_duration - input_duration).abs();
            
            let compression_ratio = (1.0 - output_size as f64 / input_size as f64) * 100.0;

            let message = format!(
                "圧縮完了: {:.1}MB -> {:.1}MB ({:.0}%削減)",
                input_size as f64 / 1024.0 / 1024.0,
                output_size as f64 / 1024.0 / 1024.0,
                compression_ratio
            );

            Ok(ConversionResult {
                success: true,
                output_path,
                input_duration,
                output_duration,
                duration_diff,
                duration_valid: duration_diff < 0.5,
                message,
            })
        }
        Err(e) => {
            if e.contains("cancelled") || e.contains("キャンセル") {
                Ok(ConversionResult {
                    success: false,
                    output_path,
                    input_duration,
                    output_duration: 0.0,
                    duration_diff: 0.0,
                    duration_valid: false,
                    message: "圧縮がキャンセルされました".to_string(),
                })
            } else {
                Err(e)
            }
        }
    }
}

/// Open directory selection dialog
/// Note: Currently handled by frontend using @tauri-apps/plugin-dialog
#[tauri::command]
pub async fn select_output_directory() -> Result<Option<String>, String> {
    Ok(None)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioProcessingResult {
    pub success: bool,
    pub output_path: String,
    pub input_duration: f64,
    pub output_duration: f64,
    pub padding_before: f64,
    pub padding_after: f64,
    pub message: String,
}

/// Get audio information using ffprobe
#[tauri::command]
pub async fn get_audio_info(path: String) -> Result<AudioInfo, String> {
    ffmpeg::get_audio_info(&path).await
}

/// Process audio with padding (silence before/after)
#[tauri::command]
pub async fn process_audio(
    app: AppHandle,
    input_path: String,
    output_path: String,
    padding_before: f64,
    padding_after: f64,
    output_format: String,
    quality: String,
    state: State<'_, ConversionState>,
) -> Result<AudioProcessingResult, String> {
    // Check if already converting
    {
        let mut is_converting = state.is_converting.lock().await;
        if *is_converting {
            return Err("変換処理が既に実行中です".to_string());
        }
        *is_converting = true;
    }

    // Reset cancel flag
    state.cancel_flag.store(false, Ordering::SeqCst);

    let cancel_flag = state.cancel_flag.clone();
    let is_converting = state.is_converting.clone();

    // Get input audio info
    let input_info = ffmpeg::get_audio_info(&input_path).await?;
    let input_duration = input_info.duration;

    // Run audio processing
    let result = ffmpeg::process_audio_with_padding(
        &input_path,
        &output_path,
        padding_before,
        padding_after,
        &output_format,
        &quality,
        cancel_flag,
        move |progress| {
            let _ = app.emit("conversion-progress", progress);
        },
    )
    .await;

    // Reset converting flag
    {
        let mut converting = is_converting.lock().await;
        *converting = false;
    }

    match result {
        Ok(output_duration) => {
            let message = format!(
                "音声処理完了: {:.2}秒 + 前{:.2}秒 + 後{:.2}秒 = {:.2}秒",
                input_duration, padding_before, padding_after, output_duration
            );

            Ok(AudioProcessingResult {
                success: true,
                output_path,
                input_duration,
                output_duration,
                padding_before,
                padding_after,
                message,
            })
        }
        Err(e) => {
            if e.contains("cancelled") || e.contains("キャンセル") {
                Ok(AudioProcessingResult {
                    success: false,
                    output_path,
                    input_duration,
                    output_duration: 0.0,
                    padding_before,
                    padding_after,
                    message: "処理がキャンセルされました".to_string(),
                })
            } else {
                Err(e)
            }
        }
    }
}

/// Get detailed media information (video/audio)
#[tauri::command]
pub async fn get_media_detail_info(path: String) -> Result<MediaDetailInfo, String> {
    ffmpeg::get_media_detail_info(&path).await
}


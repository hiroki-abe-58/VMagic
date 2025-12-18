use crate::ffmpeg::{self, VideoInfo};
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

    // Run conversion
    let result = ffmpeg::convert_video_minterpolate(
        &input_path,
        &final_output_path,
        target_fps,
        input_duration,
        use_hw_accel.unwrap_or(true),
        use_hevc.unwrap_or(false),
        quality_preset.as_deref(),
        interpolation_method.as_deref(),
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

/// Open directory selection dialog
/// Note: Currently handled by frontend using @tauri-apps/plugin-dialog
#[tauri::command]
pub async fn select_output_directory() -> Result<Option<String>, String> {
    Ok(None)
}


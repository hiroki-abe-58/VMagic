use crate::commands::{FFmpegStatus, ProgressEvent};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VideoInfo {
    pub path: String,
    pub filename: String,
    pub duration: f64,
    pub fps: f64,
    pub width: u32,
    pub height: u32,
    pub codec: String,
    pub bitrate: Option<u64>,
    pub file_size: u64,
    pub thumbnail: Option<String>, // Base64 encoded JPEG thumbnail
}

/// Check if ffmpeg and ffprobe are available on the system
pub async fn check_ffmpeg_availability() -> Result<FFmpegStatus, String> {
    let ffmpeg_result = Command::new("which").arg("ffmpeg").output().await;

    let ffprobe_result = Command::new("which").arg("ffprobe").output().await;

    let ffmpeg_path = ffmpeg_result
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    let ffprobe_path = ffprobe_result
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    let version = if ffmpeg_path.is_some() {
        let version_output = Command::new("ffmpeg").arg("-version").output().await;
        version_output.ok().map(|o| {
            let output = String::from_utf8_lossy(&o.stdout);
            output
                .lines()
                .next()
                .unwrap_or("unknown")
                .to_string()
        })
    } else {
        None
    };

    // Check VideoToolbox availability (H.264 and HEVC)
    let (videotoolbox_available, hevc_available) = if ffmpeg_path.is_some() {
        let encoders_output = Command::new("ffmpeg")
            .args(["-hide_banner", "-encoders"])
            .output()
            .await;
        encoders_output
            .ok()
            .map(|o| {
                let output = String::from_utf8_lossy(&o.stdout);
                (
                    output.contains("h264_videotoolbox"),
                    output.contains("hevc_videotoolbox"),
                )
            })
            .unwrap_or((false, false))
    } else {
        (false, false)
    };

    let available = ffmpeg_path.is_some() && ffprobe_path.is_some();

    Ok(FFmpegStatus {
        available,
        ffmpeg_path,
        ffprobe_path,
        version,
        videotoolbox_available,
        hevc_available,
    })
}

/// Get video information using ffprobe
pub async fn get_video_info(path: &str) -> Result<VideoInfo, String> {
    // Get file metadata
    let metadata = std::fs::metadata(path).map_err(|e| format!("ファイルが見つかりません: {}", e))?;
    let file_size = metadata.len();

    // Extract filename
    let filename = std::path::Path::new(path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string());

    // Run ffprobe to get video info as JSON
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            path,
        ])
        .output()
        .await
        .map_err(|e| format!("ffprobe実行エラー: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "ffprobeエラー: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value =
        serde_json::from_str(&json_str).map_err(|e| format!("JSON解析エラー: {}", e))?;

    // Find video stream
    let streams = json["streams"]
        .as_array()
        .ok_or("ストリーム情報が見つかりません")?;

    let video_stream = streams
        .iter()
        .find(|s| s["codec_type"].as_str() == Some("video"))
        .ok_or("動画ストリームが見つかりません")?;

    // Extract video properties
    let width = video_stream["width"]
        .as_u64()
        .ok_or("解像度(幅)が取得できません")? as u32;
    let height = video_stream["height"]
        .as_u64()
        .ok_or("解像度(高さ)が取得できません")? as u32;
    let codec = video_stream["codec_name"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();

    // Parse frame rate (can be fraction like "30000/1001")
    let fps = parse_frame_rate(
        video_stream["r_frame_rate"]
            .as_str()
            .or_else(|| video_stream["avg_frame_rate"].as_str())
            .unwrap_or("0/1"),
    );

    // Get duration from format or stream
    let duration = json["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .or_else(|| {
            video_stream["duration"]
                .as_str()
                .and_then(|s| s.parse::<f64>().ok())
        })
        .unwrap_or(0.0);

    // Get bitrate
    let bitrate = json["format"]["bit_rate"]
        .as_str()
        .and_then(|s| s.parse::<u64>().ok());

    // Generate thumbnail
    let thumbnail = generate_thumbnail(path, duration).await.ok();

    Ok(VideoInfo {
        path: path.to_string(),
        filename,
        duration,
        fps,
        width,
        height,
        codec,
        bitrate,
        file_size,
        thumbnail,
    })
}

/// Parse frame rate string (e.g., "30000/1001" or "30")
fn parse_frame_rate(fps_str: &str) -> f64 {
    if fps_str.contains('/') {
        let parts: Vec<&str> = fps_str.split('/').collect();
        if parts.len() == 2 {
            let num: f64 = parts[0].parse().unwrap_or(0.0);
            let den: f64 = parts[1].parse().unwrap_or(1.0);
            if den > 0.0 {
                return num / den;
            }
        }
    }
    fps_str.parse().unwrap_or(0.0)
}

/// Generate thumbnail from video at 1 second or 10% of duration
async fn generate_thumbnail(path: &str, duration: f64) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};

    // Seek position: 1 second or 10% of duration (whichever is smaller), but at least 0.1s
    let seek_time = if duration > 1.0 {
        1.0_f64.min(duration * 0.1).max(0.1)
    } else {
        0.0
    };

    // Generate thumbnail using ffmpeg
    // Output: JPEG, 200px width, maintain aspect ratio
    let output = Command::new("ffmpeg")
        .args([
            "-ss",
            &format!("{:.2}", seek_time),
            "-i",
            path,
            "-vframes",
            "1",
            "-vf",
            "scale=200:-1",
            "-f",
            "image2pipe",
            "-vcodec",
            "mjpeg",
            "-q:v",
            "5", // Quality (2-31, lower is better)
            "pipe:1",
        ])
        .output()
        .await
        .map_err(|e| format!("サムネイル生成エラー: {}", e))?;

    if !output.status.success() || output.stdout.is_empty() {
        return Err("サムネイル生成に失敗".to_string());
    }

    // Encode to base64 with data URI
    let base64_data = STANDARD.encode(&output.stdout);
    Ok(format!("data:image/jpeg;base64,{}", base64_data))
}

/// Interpolation method for frame rate conversion
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum InterpolationMethod {
    /// Motion Compensated Interpolation - highest quality, slowest
    Minterpolate,
    /// Frame blending interpolation - balanced quality and speed
    Framerate,
    /// Simple frame duplication - fastest, lowest quality
    Duplicate,
}

impl InterpolationMethod {
    pub fn from_str(s: &str) -> Self {
        match s {
            "framerate" => InterpolationMethod::Framerate,
            "duplicate" => InterpolationMethod::Duplicate,
            _ => InterpolationMethod::Minterpolate,
        }
    }
}

/// Convert video using specified interpolation method
pub async fn convert_video_minterpolate<F>(
    input_path: &str,
    output_path: &str,
    target_fps: f64,
    input_duration: f64,
    use_hw_accel: bool,
    use_hevc: bool,
    quality_preset: Option<&str>,
    interpolation_method: Option<&str>,
    cancel_flag: Arc<AtomicBool>,
    progress_callback: F,
) -> Result<f64, String>
where
    F: Fn(ProgressEvent) + Send + 'static,
{
    let method = interpolation_method
        .map(InterpolationMethod::from_str)
        .unwrap_or(InterpolationMethod::Minterpolate);

    // Build filter string based on interpolation method
    let filter = match method {
        InterpolationMethod::Minterpolate => {
            // Motion Compensated Interpolation - highest quality
            log::info!("Using minterpolate filter (highest quality, slowest)");
            format!(
                "minterpolate=fps={}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1",
                target_fps
            )
        }
        InterpolationMethod::Framerate => {
            // Frame blending - balanced
            log::info!("Using framerate filter (balanced quality and speed)");
            format!(
                "framerate=fps={}:interp_start=0:interp_end=255:scene=8.2",
                target_fps
            )
        }
        InterpolationMethod::Duplicate => {
            // Simple frame duplication - fastest
            log::info!("Using fps filter (fastest, frame duplication)");
            format!("fps={}", target_fps)
        }
    };

    // Build ffmpeg arguments
    let mut args = vec![
        "-y".to_string(), // Overwrite output
        // Multi-threading optimization for Apple Silicon
        "-threads".to_string(),
        "0".to_string(), // Auto-detect optimal thread count
    ];

    // Add input
    args.extend(["-i".to_string(), input_path.to_string()]);

    // Add filter
    args.extend(["-filter:v".to_string(), filter]);

    // Add filter thread count
    args.extend(["-filter_threads".to_string(), "0".to_string()]);

    // Determine quality value based on preset
    let quality = match quality_preset {
        Some("fast") => 50,      // Lower quality, faster
        Some("balanced") => 65,  // Balanced
        Some("quality") => 80,   // Higher quality, slower
        _ => 65,                  // Default balanced
    };

    // Add video codec settings
    if use_hw_accel {
        if use_hevc {
            // Use HEVC VideoToolbox hardware encoder (more efficient compression)
            args.extend([
                "-c:v".to_string(),
                "hevc_videotoolbox".to_string(),
                "-q:v".to_string(),
                quality.to_string(),
                "-tag:v".to_string(),
                "hvc1".to_string(), // Better compatibility with Apple devices
                "-allow_sw".to_string(),
                "1".to_string(),
            ]);
            log::info!("Using VideoToolbox HEVC hardware encoding (quality: {})", quality);
        } else {
            // Use H.264 VideoToolbox hardware encoder
            args.extend([
                "-c:v".to_string(),
                "h264_videotoolbox".to_string(),
                "-q:v".to_string(),
                quality.to_string(),
                "-allow_sw".to_string(),
                "1".to_string(),
            ]);
            log::info!("Using VideoToolbox H.264 hardware encoding (quality: {})", quality);
        }
    } else {
        if use_hevc {
            // Software HEVC encoding
            let crf = match quality_preset {
                Some("fast") => "28",
                Some("balanced") => "23",
                Some("quality") => "18",
                _ => "23",
            };
            args.extend([
                "-c:v".to_string(),
                "libx265".to_string(),
                "-preset".to_string(),
                "medium".to_string(),
                "-crf".to_string(),
                crf.to_string(),
                "-tag:v".to_string(),
                "hvc1".to_string(),
            ]);
            log::info!("Using software HEVC encoding (crf: {})", crf);
        } else {
            // Software H.264 encoding
            let crf = match quality_preset {
                Some("fast") => "23",
                Some("balanced") => "18",
                Some("quality") => "15",
                _ => "18",
            };
            args.extend([
                "-c:v".to_string(),
                "libx264".to_string(),
                "-preset".to_string(),
                "medium".to_string(),
                "-crf".to_string(),
                crf.to_string(),
            ]);
            log::info!("Using software H.264 encoding (crf: {})", crf);
        }
    }

    // Add audio and progress settings
    args.extend([
        "-c:a".to_string(),
        "copy".to_string(), // Copy audio stream
        "-progress".to_string(),
        "pipe:1".to_string(), // Output progress to stdout
        "-nostats".to_string(),
        output_path.to_string(),
    ]);

    // Spawn ffmpeg process
    let mut child = Command::new("ffmpeg")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("ffmpeg起動エラー: {}", e))?;

    let stdout = child.stdout.take().expect("Failed to capture stdout");
    let stderr = child.stderr.take().expect("Failed to capture stderr");

    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();

    // Regex for parsing progress output
    let time_regex = Regex::new(r"out_time_ms=(\d+)").unwrap();
    let frame_regex = Regex::new(r"frame=(\d+)").unwrap();
    let fps_regex = Regex::new(r"fps=([\d.]+)").unwrap();
    let speed_regex = Regex::new(r"speed=([\d.x]+)").unwrap();

    let mut current_frame: u64 = 0;
    let mut current_fps: f64 = 0.0;
    let mut current_time_ms: u64 = 0;
    let mut current_speed = String::new();

    // Process stdout for progress
    loop {
        // Check cancellation
        if cancel_flag.load(Ordering::SeqCst) {
            let _ = child.kill().await;
            return Err("変換がキャンセルされました".to_string());
        }

        tokio::select! {
            line = stdout_reader.next_line() => {
                match line {
                    Ok(Some(text)) => {
                        // Parse progress info
                        if let Some(caps) = frame_regex.captures(&text) {
                            current_frame = caps[1].parse().unwrap_or(0);
                        }
                        if let Some(caps) = fps_regex.captures(&text) {
                            current_fps = caps[1].parse().unwrap_or(0.0);
                        }
                        if let Some(caps) = time_regex.captures(&text) {
                            current_time_ms = caps[1].parse().unwrap_or(0);
                        }
                        if let Some(caps) = speed_regex.captures(&text) {
                            current_speed = caps[1].to_string();
                        }

                        // Calculate progress
                        if text.contains("progress=") {
                            let current_time_sec = current_time_ms as f64 / 1_000_000.0;
                            let progress = if input_duration > 0.0 {
                                (current_time_sec / input_duration * 100.0).min(100.0)
                            } else {
                                0.0
                            };

                            let time_str = format_time(current_time_sec);

                            progress_callback(ProgressEvent {
                                progress,
                                frame: current_frame,
                                fps: current_fps,
                                time: time_str,
                                speed: current_speed.clone(),
                            });

                            if text.contains("progress=end") {
                                break;
                            }
                        }
                    }
                    Ok(None) => break,
                    Err(_) => break,
                }
            }
            line = stderr_reader.next_line() => {
                match line {
                    Ok(Some(text)) => {
                        // Log stderr for debugging
                        log::debug!("ffmpeg stderr: {}", text);
                    }
                    Ok(None) => {}
                    Err(_) => {}
                }
            }
        }
    }

    // Wait for process to complete
    let status = child
        .wait()
        .await
        .map_err(|e| format!("ffmpegプロセスエラー: {}", e))?;

    if !status.success() {
        return Err(format!("ffmpeg変換失敗 (exit code: {:?})", status.code()));
    }

    // Get output video duration for validation
    let output_info = get_video_info(output_path).await?;

    Ok(output_info.duration)
}

/// Format seconds to HH:MM:SS.mmm
fn format_time(seconds: f64) -> String {
    let hours = (seconds / 3600.0).floor() as u32;
    let minutes = ((seconds % 3600.0) / 60.0).floor() as u32;
    let secs = seconds % 60.0;
    format!("{:02}:{:02}:{:05.2}", hours, minutes, secs)
}


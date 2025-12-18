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

    // Check RIFE availability
    let rife_result = Command::new("which")
        .arg("rife-ncnn-vulkan")
        .output()
        .await;
    
    let rife_path = rife_result
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty());

    let rife_available = rife_path.is_some();

    let available = ffmpeg_path.is_some() && ffprobe_path.is_some();

    Ok(FFmpegStatus {
        available,
        ffmpeg_path,
        ffprobe_path,
        version,
        videotoolbox_available,
        hevc_available,
        rife_available,
        rife_path,
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
    output_format: &str,
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

    // Add video codec settings based on output format
    match output_format {
        "webm" => {
            // WebM uses VP9
            let crf = match quality_preset {
                Some("fast") => "35",
                Some("balanced") => "30",
                Some("quality") => "25",
                _ => "30",
            };
            args.extend([
                "-c:v".to_string(),
                "libvpx-vp9".to_string(),
                "-crf".to_string(),
                crf.to_string(),
                "-b:v".to_string(),
                "0".to_string(),
            ]);
            log::info!("Using VP9 encoding for WebM (crf: {})", crf);
        }
        _ => {
            // MP4, MOV, MKV use H.264 or HEVC
            if use_hw_accel {
                if use_hevc {
                    args.extend([
                        "-c:v".to_string(),
                        "hevc_videotoolbox".to_string(),
                        "-q:v".to_string(),
                        quality.to_string(),
                        "-tag:v".to_string(),
                        "hvc1".to_string(),
                        "-allow_sw".to_string(),
                        "1".to_string(),
                    ]);
                    log::info!("Using VideoToolbox HEVC hardware encoding (quality: {})", quality);
                } else {
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
        }
    }

    // Add audio codec based on output format
    let audio_codec = match output_format {
        "webm" => "libopus",
        "mkv" => "copy",
        _ => "copy",  // MP4, MOV
    };

    // Add audio and progress settings
    args.extend([
        "-c:a".to_string(),
        audio_codec.to_string(),
        "-progress".to_string(),
        "pipe:1".to_string(),
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

/// Convert video using RIFE AI frame interpolation
/// Process: Extract frames -> RIFE interpolation -> Encode with ffmpeg
pub async fn convert_video_rife<F>(
    input_path: &str,
    output_path: &str,
    target_fps: f64,
    input_fps: f64,
    input_duration: f64,
    use_hw_accel: bool,
    use_hevc: bool,
    quality_preset: Option<&str>,
    output_format: &str,
    cancel_flag: Arc<AtomicBool>,
    progress_callback: F,
) -> Result<f64, String>
where
    F: Fn(ProgressEvent) + Send + 'static,
{
    use tokio::fs;

    log::info!("Starting RIFE conversion: {} fps -> {} fps", input_fps, target_fps);

    // Calculate interpolation multiplier (must be power of 2 for RIFE)
    let multiplier = (target_fps / input_fps).ceil() as u32;
    let rife_multiplier = multiplier.next_power_of_two().max(2);
    let actual_target_fps = input_fps * rife_multiplier as f64;

    log::info!("RIFE multiplier: {}x (actual output: {} fps)", rife_multiplier, actual_target_fps);

    // Create temporary directories
    let temp_dir = std::env::temp_dir().join(format!("vmagic_rife_{}", std::process::id()));
    let input_frames_dir = temp_dir.join("input");
    let output_frames_dir = temp_dir.join("output");

    fs::create_dir_all(&input_frames_dir).await
        .map_err(|e| format!("一時ディレクトリ作成エラー: {}", e))?;
    fs::create_dir_all(&output_frames_dir).await
        .map_err(|e| format!("一時ディレクトリ作成エラー: {}", e))?;

    // Cleanup function
    let cleanup = || async {
        let _ = fs::remove_dir_all(&temp_dir).await;
    };

    // Phase 1: Extract frames from input video (30% of progress)
    log::info!("Phase 1: Extracting frames...");
    progress_callback(ProgressEvent {
        progress: 0.0,
        frame: 0,
        fps: 0.0,
        time: "00:00:00.00".to_string(),
        speed: "フレーム抽出中...".to_string(),
    });

    let extract_output = Command::new("ffmpeg")
        .args([
            "-y",
            "-i", input_path,
            "-qscale:v", "2",
            &format!("{}/frame_%08d.png", input_frames_dir.display()),
        ])
        .output()
        .await
        .map_err(|e| format!("フレーム抽出エラー: {}", e))?;

    if !extract_output.status.success() {
        let stderr = String::from_utf8_lossy(&extract_output.stderr);
        log::error!("Frame extraction error: {}", stderr);
        cleanup().await;
        return Err(format!("フレーム抽出に失敗しました: {}", stderr));
    }

    if cancel_flag.load(Ordering::SeqCst) {
        cleanup().await;
        return Err("変換がキャンセルされました".to_string());
    }

    progress_callback(ProgressEvent {
        progress: 30.0,
        frame: 0,
        fps: 0.0,
        time: "00:00:00.00".to_string(),
        speed: "RIFE補間中...".to_string(),
    });

    // Count extracted frames
    let mut frame_count = 0;
    if let Ok(mut entries) = tokio::fs::read_dir(&input_frames_dir).await {
        while let Ok(Some(_)) = entries.next_entry().await {
            frame_count += 1;
        }
    }
    log::info!("Extracted {} frames", frame_count);

    if frame_count == 0 {
        cleanup().await;
        return Err("フレームが抽出できませんでした".to_string());
    }

    // Phase 2: Run RIFE interpolation (50% of progress)
    log::info!("Phase 2: Running RIFE interpolation ({}x)...", rife_multiplier);

    // Find model directory
    let model_dir = if std::path::Path::new("/usr/local/share/rife-ncnn-vulkan/rife-v4.6").exists() {
        "/usr/local/share/rife-ncnn-vulkan/rife-v4.6".to_string()
    } else if std::path::Path::new("/usr/local/share/rife-ncnn-vulkan/rife-v4").exists() {
        "/usr/local/share/rife-ncnn-vulkan/rife-v4".to_string()
    } else {
        "rife-v4.6".to_string() // fallback to relative path
    };

    log::info!("Using RIFE model: {}", model_dir);

    // Calculate target frame count (input frames * multiplier)
    let target_frame_count = frame_count * rife_multiplier as usize;
    log::info!("Target frame count: {} ({}x{})", target_frame_count, frame_count, rife_multiplier);

    let rife_output = Command::new("rife-ncnn-vulkan")
        .args([
            "-i", &input_frames_dir.to_string_lossy(),
            "-o", &output_frames_dir.to_string_lossy(),
            "-m", &model_dir,
            "-n", &target_frame_count.to_string(),
            "-f", "frame_%08d.png",
        ])
        .output()
        .await
        .map_err(|e| format!("RIFE実行エラー: {}", e))?;

    if !rife_output.status.success() {
        let stderr = String::from_utf8_lossy(&rife_output.stderr);
        log::error!("RIFE error: {}", stderr);
        cleanup().await;
        return Err(format!("RIFEフレーム補間に失敗しました: {}", stderr));
    }

    // Count output frames
    let mut output_frame_count = 0;
    if let Ok(mut entries) = tokio::fs::read_dir(&output_frames_dir).await {
        while let Ok(Some(_)) = entries.next_entry().await {
            output_frame_count += 1;
        }
    }
    log::info!("RIFE generated {} frames (expected ~{})", output_frame_count, frame_count * rife_multiplier as usize);

    if output_frame_count == 0 {
        cleanup().await;
        return Err("RIFEがフレームを生成できませんでした".to_string());
    }

    if cancel_flag.load(Ordering::SeqCst) {
        cleanup().await;
        return Err("変換がキャンセルされました".to_string());
    }

    progress_callback(ProgressEvent {
        progress: 80.0,
        frame: 0,
        fps: 0.0,
        time: "00:00:00.00".to_string(),
        speed: "エンコード中...".to_string(),
    });

    // Phase 3: Encode interpolated frames to video (20% of progress)
    log::info!("Phase 3: Encoding to video...");

    // Extract audio from original video
    let audio_path = temp_dir.join("audio.aac");
    let _ = Command::new("ffmpeg")
        .args([
            "-y",
            "-i", input_path,
            "-vn",
            "-acodec", "copy",
            &audio_path.to_string_lossy(),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await;

    let has_audio = audio_path.exists();

    // Calculate actual output framerate based on generated frames and original duration
    let actual_output_fps = output_frame_count as f64 / input_duration;
    log::info!("Encoding at {} fps ({} frames / {} seconds)", actual_output_fps, output_frame_count, input_duration);

    // Build encoding arguments
    let mut encode_args = vec![
        "-y".to_string(),
        "-framerate".to_string(),
        actual_output_fps.to_string(),
        "-i".to_string(),
        format!("{}/frame_%08d.png", output_frames_dir.display()),
    ];

    if has_audio {
        encode_args.extend([
            "-i".to_string(),
            audio_path.to_string_lossy().to_string(),
        ]);
    }

    // Determine quality
    let quality = match quality_preset {
        Some("fast") => 50,
        Some("balanced") => 65,
        Some("quality") => 80,
        _ => 65,
    };

    // Add video codec settings based on output format
    match output_format {
        "webm" => {
            let crf = match quality_preset {
                Some("fast") => "35",
                Some("balanced") => "30",
                Some("quality") => "25",
                _ => "30",
            };
            encode_args.extend([
                "-c:v".to_string(),
                "libvpx-vp9".to_string(),
                "-crf".to_string(),
                crf.to_string(),
                "-b:v".to_string(),
                "0".to_string(),
            ]);
            log::info!("Using VP9 encoding for WebM (crf: {})", crf);
        }
        _ => {
            if use_hw_accel {
                if use_hevc {
                    encode_args.extend([
                        "-c:v".to_string(),
                        "hevc_videotoolbox".to_string(),
                        "-q:v".to_string(),
                        quality.to_string(),
                        "-tag:v".to_string(),
                        "hvc1".to_string(),
                    ]);
                } else {
                    encode_args.extend([
                        "-c:v".to_string(),
                        "h264_videotoolbox".to_string(),
                        "-q:v".to_string(),
                        quality.to_string(),
                    ]);
                }
            } else {
                let crf = match quality_preset {
                    Some("fast") => "23",
                    Some("balanced") => "18",
                    Some("quality") => "15",
                    _ => "18",
                };
                encode_args.extend([
                    "-c:v".to_string(),
                    "libx264".to_string(),
                    "-preset".to_string(),
                    "medium".to_string(),
                    "-crf".to_string(),
                    crf.to_string(),
                ]);
            }
        }
    }

    // Add audio settings based on format
    if has_audio {
        let audio_codec = match output_format {
            "webm" => "libopus",
            _ => "aac",
        };
        encode_args.extend([
            "-c:a".to_string(),
            audio_codec.to_string(),
            "-b:a".to_string(),
            "192k".to_string(),
            "-map".to_string(),
            "0:v".to_string(),
            "-map".to_string(),
            "1:a".to_string(),
        ]);
    }

    // If target_fps differs from actual output fps, add fps filter to adjust
    if (target_fps - actual_output_fps).abs() > 1.0 {
        log::info!("Adjusting framerate from {} to {}", actual_output_fps, target_fps);
        encode_args.extend([
            "-filter:v".to_string(),
            format!("fps={}", target_fps),
        ]);
    }

    encode_args.push(output_path.to_string());

    let encode_status = Command::new("ffmpeg")
        .args(&encode_args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map_err(|e| format!("エンコードエラー: {}", e))?;

    // Cleanup temp files
    cleanup().await;

    if !encode_status.success() {
        return Err("動画エンコードに失敗しました".to_string());
    }

    progress_callback(ProgressEvent {
        progress: 100.0,
        frame: 0,
        fps: 0.0,
        time: format_time(input_duration),
        speed: "完了".to_string(),
    });

    // Get output video duration for validation
    let output_info = get_video_info(output_path).await?;

    log::info!("RIFE conversion complete: {} -> {}", input_path, output_path);

    Ok(output_info.duration)
}


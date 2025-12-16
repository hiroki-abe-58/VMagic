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

    let available = ffmpeg_path.is_some() && ffprobe_path.is_some();

    Ok(FFmpegStatus {
        available,
        ffmpeg_path,
        ffprobe_path,
        version,
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

/// Convert video using minterpolate filter
pub async fn convert_video_minterpolate<F>(
    input_path: &str,
    output_path: &str,
    target_fps: f64,
    input_duration: f64,
    cancel_flag: Arc<AtomicBool>,
    progress_callback: F,
) -> Result<f64, String>
where
    F: Fn(ProgressEvent) + Send + 'static,
{
    // Build minterpolate filter string
    let filter = format!(
        "minterpolate=fps={}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1",
        target_fps
    );

    // Spawn ffmpeg process
    let mut child = Command::new("ffmpeg")
        .args([
            "-y", // Overwrite output
            "-i",
            input_path,
            "-filter:v",
            &filter,
            "-c:a",
            "copy", // Copy audio stream
            "-progress",
            "pipe:1", // Output progress to stdout
            "-nostats",
            output_path,
        ])
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


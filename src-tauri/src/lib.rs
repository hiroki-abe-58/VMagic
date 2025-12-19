mod commands;
mod ffmpeg;
mod validation;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(ConversionState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_ffmpeg,
            get_video_info,
            convert_video,
            upscale_video,
            compress_video,
            cancel_conversion,
            select_output_directory,
            get_audio_info,
            process_audio,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

# VMagic - Video FPS Converter

[Japanese / 日本語](README.md)

A desktop application for video frame rate conversion using ffmpeg's minterpolate filter.
**Duration preservation guarantee** is the core feature.

## Features

- **Apple Silicon acceleration**: Hardware encoding via VideoToolbox (M1/M2/M3)
- **Batch processing support**: Convert multiple files at once
- **Minterpolate-based frame interpolation**: Smooth conversion with high-quality frame interpolation
- **Duration preservation guarantee**: Ensures duration difference within ±0.1 seconds before and after conversion
- **Real-time progress display**: Shows progress, frame count, and processing speed during conversion
- **Preset support**: 24fps (Cinema), 25fps (PAL), 29.97fps (NTSC), 30fps, 50fps, 59.94fps, 60fps
- **Dark theme UI**: Modern design with neon yellow accents
- **Auto output path**: Converted files are automatically saved in the same directory as the source

## Tech Stack

- **Frontend**: React 18 + TypeScript + TailwindCSS
- **Desktop Framework**: Tauri 2.x (Rust)
- **Video Processing**: ffmpeg (system installation)

## Prerequisites

### 1. Install ffmpeg

```bash
# macOS (Homebrew)
brew install ffmpeg

# Verify installation
ffmpeg -version
ffprobe -version
```

### 2. Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 3. Node.js

Node.js 18.x or higher recommended

## Installation

```bash
# Install dependencies
npm install

# Start development server
npm run tauri:dev

# Production build
npm run tauri:build
```

## Usage

### Single File Conversion
1. Launch the app
2. Drag & drop a video file or click to select
3. Choose target frame rate (preset or custom)
4. Click "Start Batch Conversion"
5. After conversion, verify the duration validation result

### Batch Conversion (Multiple Files)
1. Launch the app
2. Drag & drop multiple video files, or select multiple files
3. Review the file list (unwanted files can be removed)
4. Choose target frame rate
5. Click "Start Batch Conversion"
6. Conversion status for each file is displayed in real-time
7. Cancel anytime if needed

## ffmpeg Command Used

```bash
ffmpeg -i input.mp4 \
  -filter:v "minterpolate=fps={target_fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1" \
  -c:a copy \
  output.mp4
```

### Minterpolate Parameters

- `fps`: Target frame rate
- `mi_mode=mci`: Motion Compensated Interpolation
- `mc_mode=aobmc`: Adaptive Overlapped Block Motion Compensation
- `me_mode=bidir`: Bidirectional motion estimation
- `vsbmc=1`: Variable-Size Block Motion Compensation enabled

## Project Structure

```
VMagic/
├── src/                          # React Frontend
│   ├── components/               # UI Components
│   │   ├── VideoDropZone.tsx     # Drag & drop area (multi-file support)
│   │   ├── BatchFileList.tsx     # Batch file list
│   │   ├── BatchProgress.tsx     # Batch progress display
│   │   ├── VideoInfo.tsx         # Video information display
│   │   ├── FpsSettings.tsx       # FPS settings + presets
│   │   ├── OutputPreview.tsx     # Output preview
│   │   ├── ConvertButton.tsx     # Convert button
│   │   ├── ProgressBar.tsx       # Progress display
│   │   └── OutputSelector.tsx    # Output destination selector
│   ├── hooks/                    # Custom hooks
│   │   ├── useBatchConvert.ts    # Batch conversion processing
│   │   ├── useVideoInfo.ts       # Video info fetching
│   │   └── useConvert.ts         # Conversion processing
│   ├── lib/                      # Utilities
│   │   ├── tauri-commands.ts     # Tauri command wrapper
│   │   └── presets.ts            # FPS presets
│   ├── types/                    # Type definitions
│   │   └── video.ts
│   └── App.tsx
├── src-tauri/                    # Rust Backend
│   ├── src/
│   │   ├── main.rs               # Entry point
│   │   ├── lib.rs                # Tauri app configuration
│   │   ├── commands.rs           # Tauri commands
│   │   ├── ffmpeg.rs             # ffmpeg/ffprobe execution
│   │   └── validation.rs         # Duration validation
│   ├── Cargo.toml
│   └── tauri.conf.json
└── package.json
```

## How Duration Preservation Works

1. **Before conversion**: Record input video duration
2. **During conversion**: Specify target fps directly with minterpolate filter (duration automatically preserved)
3. **After conversion**: Get output video duration and compare with input
4. **Validation**: Success if difference is within ±0.1 seconds, error displayed if exceeded

## Supported Formats

- **Input**: MP4, MOV, AVI, MKV, WebM, FLV, M4V, WMV, MPG, MPEG
- **Output**: MP4 (H.264)

## Hardware Acceleration

Macs with Apple Silicon (M1/M2/M3) support hardware encoding via VideoToolbox.

### VideoToolbox Benefits
- Uses Apple Silicon Media Engine
- Significantly faster encoding (2-5x vs software)
- Reduced battery consumption
- Maintains high quality output

### Notes
- Frame interpolation (minterpolate) runs on CPU
- VideoToolbox accelerates only the encoding (output) stage
- Toggle on/off in settings panel
- Automatically falls back to software encoding (libx264) when VideoToolbox is unavailable

## Troubleshooting

### ffmpeg not found

```bash
# Check path
which ffmpeg
which ffprobe

# Reinstall with Homebrew
brew reinstall ffmpeg
```

### Xcode Command Line Tools error

```bash
# Reinstall
xcode-select --install

# Or reset
sudo xcode-select --reset
```

### Rust build error

```bash
# Update Rust
rustup update stable
```

## License

MIT License

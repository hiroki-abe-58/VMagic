# VMagic - Video FPS Converter & AI Upscaler

[English](README.en.md)

動画フレームレート変換＆AI高画質化デスクトップアプリケーション。
**総尺維持保証**と**Apple Silicon最適化**が核心機能。

## 特徴

- **Apple Silicon高速化**: VideoToolboxによるハードウェアエンコードに対応（M1/M2/M3）
- **AI高画質化 (Real-ESRGAN)**: 動画を2x/3x/4x拡大。実写・アニメ両対応のAIモデル
- **バッチ処理対応**: 複数ファイルの一括変換に対応
- **サムネイルプレビュー**: 動画のサムネイルを自動生成し、ファイルリストに表示
- **複数フレーム補間方式**: RIFE (AI)、minterpolate、framerate、fpsから選択
- **総尺維持保証**: 変換前後の総尺差を±0.1秒以内に保証
- **リアルタイム進捗表示**: 変換中の進捗、フレーム数、処理速度を表示
- **プリセット対応**: 24fps（映画）、25fps（PAL）、29.97fps（NTSC）、30fps、50fps、59.94fps、60fps
- **ダークテーマUI**: ネオンイエローをアクセントにしたモダンなデザイン
- **自動出力先設定**: 変換後のファイルは元のファイルと同じディレクトリに自動保存

## 技術スタック

- **Frontend**: React 18 + TypeScript + TailwindCSS
- **Desktop Framework**: Tauri 2.x (Rust)
- **Video Processing**: ffmpeg (システムインストール)

## 前提条件

### 1. ffmpegのインストール

```bash
# macOS (Homebrew)
brew install ffmpeg

# 確認
ffmpeg -version
ffprobe -version
```

### 2. Rustのインストール

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 3. Node.js

Node.js 18.x 以上を推奨

### 4. Real-ESRGAN (オプション - AI高画質化用)

```bash
# GitHubからダウンロード
curl -L -o realesrgan.zip https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/releases/download/v0.2.0/realesrgan-ncnn-vulkan-v0.2.0-macos.zip
unzip realesrgan.zip

# パスを通す
sudo cp realesrgan-ncnn-vulkan-v0.2.0-macos/realesrgan-ncnn-vulkan /usr/local/bin/

# 確認
realesrgan-ncnn-vulkan -h
```

### 5. RIFE (オプション - AIフレーム補間用)

```bash
# GitHubからダウンロード
curl -L -o rife.zip https://github.com/nihui/rife-ncnn-vulkan/releases/download/20221029/rife-ncnn-vulkan-20221029-macos.zip
unzip rife.zip

# パスを通す
sudo cp rife-ncnn-vulkan-20221029-macos/rife-ncnn-vulkan /usr/local/bin/
sudo mkdir -p /usr/local/share/rife-ncnn-vulkan
sudo cp -r rife-ncnn-vulkan-20221029-macos/rife* /usr/local/share/rife-ncnn-vulkan/

# 確認
rife-ncnn-vulkan -h
```

## インストール

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run tauri:dev

# プロダクションビルド
npm run tauri:build
```

## 使い方

### 単一ファイル変換
1. アプリを起動
2. 動画ファイルをドラッグ&ドロップまたはクリックして選択
3. 目標フレームレートを選択（プリセットまたはカスタム）
4. 「バッチ変換開始」をクリック
5. 変換完了後、総尺の検証結果を確認

### バッチ変換（複数ファイル）
1. アプリを起動
2. 複数の動画ファイルをドラッグ&ドロップ、または複数選択
3. ファイルリストで対象ファイルを確認（不要なファイルは削除可能）
4. 目標フレームレートを選択
5. 「バッチ変換開始」をクリック
6. 各ファイルの変換状況がリアルタイムで表示される
7. 必要に応じてキャンセル可能

## AI高画質化 (Real-ESRGAN)

動画の解像度をAIでアップスケールします。Apple Silicon上でVulkan経由のGPU処理を使用。

### 拡大率
- **2x**: 1920x1080 → 3840x2160
- **3x**: 1920x1080 → 5760x3240
- **4x**: 1920x1080 → 7680x4320

### AIモデル

| モデル | 特徴 | 用途 |
|--------|------|------|
| Real-ESRGAN x4plus | 汎用モデル | 実写/イラスト両対応 |
| Real-ESRGAN x4plus Anime | アニメ最適化 | アニメ/イラスト向け |
| RealESR AnimeVideo v3 | 動画専用 | アニメ動画、高速処理 |

### 処理フロー
1. フレーム抽出 (ffmpeg)
2. 各フレームをReal-ESRGANでアップスケール
3. 動画に再エンコード (VideoToolbox or ソフトウェア)

## フレーム補間方式

4つのフレーム補間方式から選択できます：

### 1. AI補間 (RIFE) - 推奨
- **品質**: 最高（AIによる自然なフレーム生成）
- **速度**: 高速（GPU/Vulkan使用）
- **特徴**: ディープラーニングベースのオプティカルフロー推定
- **要件**: rife-ncnn-vulkanのインストールが必要（前提条件参照）

### 2. 高品質 (minterpolate)
```bash
ffmpeg -i input.mp4 \
  -filter:v "minterpolate=fps={target_fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1" \
  -c:a copy output.mp4
```
- **品質**: 最高
- **速度**: 遅い（CPU集約）
- **特徴**: モーション補間による滑らかなフレーム生成
- **用途**: 品質重視の最終出力

### 2. バランス (framerate)
```bash
ffmpeg -i input.mp4 \
  -filter:v "framerate=fps={target_fps}:interp_start=0:interp_end=255:scene=8.2" \
  -c:a copy output.mp4
```
- **品質**: 中程度
- **速度**: 速い
- **特徴**: フレームブレンディングによる補間
- **用途**: 速度と品質のバランス

### 3. 高速 (duplicate)
```bash
ffmpeg -i input.mp4 \
  -filter:v "fps={target_fps}" \
  -c:a copy output.mp4
```
- **品質**: 低い
- **速度**: 最速
- **特徴**: 単純なフレーム複製/ドロップ
- **用途**: プレビュー、高速処理

### minterpolateパラメータ詳細

- `fps`: 目標フレームレート
- `mi_mode=mci`: Motion Compensated Interpolation
- `mc_mode=aobmc`: Adaptive Overlapped Block Motion Compensation
- `me_mode=bidir`: 双方向モーション推定
- `vsbmc=1`: Variable-Size Block Motion Compensation有効

## プロジェクト構造

```
VMagic/
├── src/                          # React Frontend
│   ├── components/               # UIコンポーネント
│   │   ├── VideoDropZone.tsx     # ドラッグ&ドロップエリア（複数ファイル対応）
│   │   ├── BatchFileList.tsx     # バッチファイルリスト
│   │   ├── BatchProgress.tsx     # バッチ進捗表示
│   │   ├── VideoInfo.tsx         # 動画情報表示
│   │   ├── FpsSettings.tsx       # fps設定 + プリセット
│   │   ├── OutputPreview.tsx     # 出力プレビュー
│   │   ├── ConvertButton.tsx     # 変換ボタン
│   │   ├── ProgressBar.tsx       # 進捗表示
│   │   └── OutputSelector.tsx    # 出力先選択
│   ├── hooks/                    # カスタムフック
│   │   ├── useBatchConvert.ts    # バッチ変換処理
│   │   ├── useVideoInfo.ts       # 動画情報取得
│   │   └── useConvert.ts         # 変換処理
│   ├── lib/                      # ユーティリティ
│   │   ├── tauri-commands.ts     # Tauriコマンドラッパー
│   │   └── presets.ts            # fpsプリセット
│   ├── types/                    # 型定義
│   │   └── video.ts
│   └── App.tsx
├── src-tauri/                    # Rust Backend
│   ├── src/
│   │   ├── main.rs               # エントリポイント
│   │   ├── lib.rs                # Tauriアプリ設定
│   │   ├── commands.rs           # Tauriコマンド
│   │   ├── ffmpeg.rs             # ffmpeg/ffprobe実行
│   │   └── validation.rs         # 総尺検証
│   ├── Cargo.toml
│   └── tauri.conf.json
└── package.json
```

## 総尺維持の仕組み

1. **変換前**: 入力動画のdurationを記録
2. **変換**: minterpolateフィルタで目標fpsを直接指定（尺が自動的に維持される）
3. **変換後**: 出力動画のdurationを取得し、入力と比較
4. **検証**: 差が±0.1秒以内であれば成功、超過したらエラー表示

## 対応フォーマット

- **入力**: MP4, MOV, AVI, MKV, WebM, FLV, M4V, WMV, MPG, MPEG
- **出力**: 
  - MP4 (H.264/HEVC) - 最も互換性が高い
  - MOV (H.264/HEVC) - Apple製品向け
  - WebM (VP9) - Web向け、透過対応
  - MKV (H.264/HEVC) - 高い柔軟性

## ハードウェア高速化

Apple Silicon搭載Mac（M1/M2/M3）では、VideoToolboxを使用したハードウェアエンコードに対応しています。

### VideoToolboxの利点
- Apple Silicon Media Engineを使用
- エンコード処理が大幅に高速化（ソフトウェアの2-5倍程度）
- バッテリー消費を抑制
- 高品質な出力を維持

### HEVC (H.265) 出力
- H.264より30-50%高い圧縮率
- 同じファイルサイズでより高画質
- Apple製デバイスとの高い互換性

### 品質プリセット
- **高速**: 処理速度優先。ファイルサイズが大きくなる場合あり
- **バランス**: 速度と品質のバランスを取った設定（デフォルト）
- **高品質**: 最高品質。処理に時間がかかります

### 最適化詳細
- マルチスレッド最適化: M1 Maxの全10コアを活用
- フィルタスレッド最適化: minterpolate処理の並列化
- VideoToolboxが利用できない環境では自動的にソフトウェアエンコードにフォールバック

### 注意事項
- フレーム補間処理（minterpolate）自体はCPUで実行されます（GPU化不可）
- VideoToolboxはエンコード（出力）部分のみを高速化

## トラブルシューティング

### ffmpegが見つからない

```bash
# パスを確認
which ffmpeg
which ffprobe

# Homebrewで再インストール
brew reinstall ffmpeg
```

### Xcode Command Line Toolsのエラー

```bash
# 再インストール
xcode-select --install

# または
sudo xcode-select --reset
```

### Rustのビルドエラー

```bash
# Rustのアップデート
rustup update stable
```

## ライセンス

MIT License

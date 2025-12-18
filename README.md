# VMagic - Video FPS Converter

[English](README.en.md)

ffmpegのminterpolateフィルタを使用した動画フレームレート変換デスクトップアプリケーション。
**総尺維持保証**が核心機能。

## 特徴

- **バッチ処理対応**: 複数ファイルの一括変換に対応
- **minterpolateベースのフレーム補間**: 高品質なフレーム補間による滑らかな変換
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

## 使用するffmpegコマンド

```bash
ffmpeg -i input.mp4 \
  -filter:v "minterpolate=fps={target_fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1" \
  -c:a copy \
  output.mp4
```

### minterpolateパラメータ

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
- **出力**: MP4 (H.264)

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

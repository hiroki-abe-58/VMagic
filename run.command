#!/bin/bash

# VMagic - FPS Converter 起動スクリプト
# ダブルクリックで実行可能

# スクリプトのディレクトリに移動
cd "$(dirname "$0")"

echo "========================================"
echo "  VMagic - FPS Converter"
echo "========================================"
echo ""

# 使用可能なポートを探す関数
find_available_port() {
    local port=$1
    local max_port=$((port + 100))
    
    while [ $port -lt $max_port ]; do
        if ! lsof -i :$port > /dev/null 2>&1; then
            echo $port
            return 0
        fi
        port=$((port + 1))
    done
    
    echo "0"
    return 1
}

# デフォルトポート
DEFAULT_PORT=5173

# 使用可能なポートを探す
echo "ポートを確認中..."
AVAILABLE_PORT=$(find_available_port $DEFAULT_PORT)

if [ "$AVAILABLE_PORT" = "0" ]; then
    echo "エラー: 利用可能なポートが見つかりません (${DEFAULT_PORT}-$((DEFAULT_PORT + 100)))"
    echo "他のアプリケーションを終了してから再試行してください。"
    read -p "Enterキーを押して終了..."
    exit 1
fi

if [ "$AVAILABLE_PORT" != "$DEFAULT_PORT" ]; then
    echo "ポート ${DEFAULT_PORT} は使用中です。ポート ${AVAILABLE_PORT} を使用します。"
else
    echo "ポート ${AVAILABLE_PORT} を使用します。"
fi

# 依存関係の確認
if [ ! -d "node_modules" ]; then
    echo ""
    echo "依存関係をインストール中..."
    npm install
    if [ $? -ne 0 ]; then
        echo "エラー: npm install に失敗しました"
        read -p "Enterキーを押して終了..."
        exit 1
    fi
fi

# ffmpegの確認
echo ""
echo "ffmpegを確認中..."
if ! command -v ffmpeg &> /dev/null; then
    echo ""
    echo "警告: ffmpegがインストールされていません"
    echo "以下のコマンドでインストールしてください:"
    echo "  brew install ffmpeg"
    echo ""
    echo "ffmpegなしでも起動しますが、変換機能は使用できません。"
    echo ""
fi

# tauri.conf.jsonのdevUrlを更新
TAURI_CONF="src-tauri/tauri.conf.json"
if [ -f "$TAURI_CONF" ]; then
    # 現在のdevUrlを保存
    ORIGINAL_DEV_URL=$(grep -o '"devUrl": "[^"]*"' "$TAURI_CONF" | head -1)
    
    # 新しいポートでdevUrlを更新
    sed -i '' "s|\"devUrl\": \"http://localhost:[0-9]*\"|\"devUrl\": \"http://localhost:${AVAILABLE_PORT}\"|g" "$TAURI_CONF"
fi

echo ""
echo "アプリを起動中..."
echo "ポート: ${AVAILABLE_PORT}"
echo ""
echo "終了するには Ctrl+C を押してください"
echo "========================================"
echo ""

# 環境変数でポートを渡してTauriを起動
VITE_PORT=$AVAILABLE_PORT npm run tauri:dev

# 終了時にポートを元に戻す
if [ "$AVAILABLE_PORT" != "$DEFAULT_PORT" ] && [ -f "$TAURI_CONF" ]; then
    sed -i '' "s|\"devUrl\": \"http://localhost:${AVAILABLE_PORT}\"|\"devUrl\": \"http://localhost:${DEFAULT_PORT}\"|g" "$TAURI_CONF"
fi

echo ""
echo "アプリが終了しました。"
read -p "Enterキーを押して閉じる..."

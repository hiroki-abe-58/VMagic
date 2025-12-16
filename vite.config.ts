import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Tauri dev server settings
  server: {
    port: parseInt(process.env.VITE_PORT || '5173'),
    strictPort: false, // ポートが使用中の場合、次の空きポートを使用
    host: 'localhost',
  },

  // Tauri needs to know where the entry point is
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },

  // Prevent vite from obscuring Rust errors
  clearScreen: false,
})

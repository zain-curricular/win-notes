import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Bundles the TipTap editor (same extensions as the desktop app) into one HTML file for the
// mobile app's WebView. Run through scripts/build-mobile-editor.mjs.
export default defineConfig({
  root: __dirname,
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,
    reportCompressedSize: false
  },
  logLevel: 'warn'
})

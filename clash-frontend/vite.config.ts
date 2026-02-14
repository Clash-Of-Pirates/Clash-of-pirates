import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [react(),wasm()],
  // Load .env files from the parent directory (repo root)
  envDir: '..',
  define: {
    global: 'globalThis'
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: path.resolve(__dirname, './node_modules/buffer/'),
      'pino': path.resolve(__dirname, 'node_modules/pino/browser.js'),
    },
    dedupe: ['@stellar/stellar-sdk']
  },
  optimizeDeps: {
    include: ['@stellar/stellar-sdk', '@stellar/stellar-sdk/contract', '@stellar/stellar-sdk/rpc', 'buffer'],
    exclude: ['@noir-lang/noir_js','@noir-lang/acvm_js', '@noir-lang/noirc_abi', '@aztec/bb.js'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
        target: 'esnext'
      }
    },
    
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true
    },
    target: 'esnext'
  },
  server: {
    proxy: {
      '/soroban': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
    port: 3000,
    open: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
    fs: {
      strict: false
    },
  },
  worker: {
    format: 'es',
    plugins: () => []
  },
  assetsInclude: ['**/*.wasm']
})

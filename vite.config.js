import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

const CERT_DIR = path.resolve(__dirname, '.cert')
const HTTPS_PFX_PATH = path.join(CERT_DIR, 'doctrack-lan.pfx')
const HTTPS_PASSPHRASE_PATH = path.join(CERT_DIR, 'https-passphrase.txt')

function getHttpsConfig() {
  const flag = String(process.env.DOCTRACK_HTTPS || '').trim()
  if (flag === '0') return false

  const hasPfx = fs.existsSync(HTTPS_PFX_PATH)
  if (flag !== '1' && !hasPfx) return false

  if (!hasPfx) {
    console.warn(`[DocTrack] HTTPS requested but missing certificate: ${HTTPS_PFX_PATH}`)
    return false
  }

  const passphrase = fs.existsSync(HTTPS_PASSPHRASE_PATH)
    ? fs.readFileSync(HTTPS_PASSPHRASE_PATH, 'utf8').trim()
    : ''

  const httpsConfig = {
    pfx: fs.readFileSync(HTTPS_PFX_PATH),
  }

  if (passphrase) {
    httpsConfig.passphrase = passphrase
  }

  return httpsConfig
}

const httpsConfig = getHttpsConfig()
const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:3001',
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    open: true,
    https: httpsConfig,
    proxy: apiProxy,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    https: httpsConfig,
    proxy: apiProxy,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'pdfjs': ['pdfjs-dist'],
        }
      }
    }
  }
})

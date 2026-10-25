import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

/**
 * Development only: reads a web page for the Brand page's "fetch from website", because a browser tab cannot
 * (the desktop app does it with Tauri's HTTP and never goes through here). Public http(s) addresses only.
 */
const siteReader = (): Plugin => ({
  name: 'site-reader',
  configureServer(server) {
    server.middlewares.use('/api/proxy/site', async (req, res) => {
      try {
        const target = new URL(new URL(req.url ?? '', 'http://x').searchParams.get('url') ?? '')
        const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/.test(target.hostname)
        if (!/^https?:$/.test(target.protocol) || local) throw new Error('not allowed')
        const upstream = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' })
        const bytes = Buffer.from(await upstream.arrayBuffer())
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream')
        res.end(bytes.subarray(0, 5_000_000))
      } catch {
        res.statusCode = 400
        res.end('bad address')
      }
    })
  },
})

/**
 * Two editions are built from this code. The official app has src/pro (the Agent and the App builder). A community build made from the public
 * source has no src/pro, so @pro points at src/pro-stub, which holds small stand-ins that say the feature is not part of the build.
 * Set EDITION=community to build the community edition from the full tree.
 */
const proFolder = fs.existsSync(path.resolve(import.meta.dirname, './src/pro')) && process.env.EDITION !== 'community' ? './src/pro' : './src/pro-stub'

export default defineConfig({
  define: {
    __GENCRAFT_EDITION__: JSON.stringify(proFolder.endsWith('pro-stub') ? 'community' : 'pro'),
  },
  plugins: [react(), siteReader()],
  resolve: {
    alias: {
      '@pro': path.resolve(import.meta.dirname, proFolder),
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // This project's own port, so another project on 5173 can never be opened by mistake. strictPort: fail rather than drift to another one.
    port: 5180,
    strictPort: true,
    host: true,
    proxy: {
      '/api/proxy/composio': {
        target: 'https://backend.composio.dev',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/proxy\/composio/, ''),
        secure: true,
      },
      '/api/proxy/replicate': {
        target: 'https://api.replicate.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/proxy\/replicate/, ''),
        secure: true,
      },
      '/api/proxy/rweb': {
        target: 'https://replicate.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/proxy\/rweb/, ''),
        secure: true,
      },
      '/api/proxy/gemini': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/proxy\/gemini/, ''),
        secure: true,
      },
      '/api/proxy/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/proxy\/openai/, ''),
        secure: true,
      },
      '/api/proxy/openrouter': {
        target: 'https://openrouter.ai',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/proxy\/openrouter/, ''),
        secure: true,
      },
      '/api/proxy/runfal': {
        target: 'https://fal.run',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/proxy\/runfal/, ''),
        secure: true,
      },
      '/api/proxy/fal': {
        target: 'https://api.fal.ai',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/proxy\/fal/, ''),
        secure: true,
      },
    },
  },
})

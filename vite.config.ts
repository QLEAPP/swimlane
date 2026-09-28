import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves a project repo at /<repo-name>/, not /, so asset
// paths need that prefix in production. The deploy workflow sets
// BASE_PATH to the real repo name at build time - locally (no env var
// set) this defaults to / so `npm run dev` is unaffected.
// https://vite.dev/config/
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  // Explicit host (added 2026-09-28 - real report of "localhost fails to
  // load") - Vite's own default loopback-only bind can end up listening on
  // just one of IPv4 (127.0.0.1) / IPv6 (::1) depending on the machine's
  // network config, while a browser trying the other one hangs/fails to
  // connect even though the dev server itself is running fine (confirmed:
  // curl/Invoke-WebRequest reached it, a browser didn't). Binding to every
  // interface removes that ambiguity entirely.
  server: {
    host: true,
  },
})

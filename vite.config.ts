import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR_PROYEK = path.dirname(fileURLToPath(import.meta.url));

/**
 * Plugin Vite untuk stub paket @tauri-apps/plugin-notification.
 *
 * Paket ini hanya tersedia di runtime Tauri (AppImage/Android). Saat
 * `npm run dev` (web biasa), file fisiknya tidak ada di node_modules
 * dan Vite 8 gagal saat scan optimizeDeps meski ada /* @vite-ignore *.
 *
 * Stub ini mengembalikan modul kosong yang melempar saat dipanggil —
 * persis seperti yang sudah ditangani oleh blok catch di useAutoPresensi.ts.
 */
function tauriNotifStub() {
  const modId = '@tauri-apps/plugin-notification';
  const resolvedId = '\0' + modId;
  return {
    name: 'tauri-notif-stub',
    resolveId(id: string) {
      if (id === modId) return resolvedId;
    },
    load(id: string) {
      if (id === resolvedId) {
        return `
export async function isPermissionGranted() { return false; }
export async function requestPermission() { return 'denied'; }
export async function sendNotification() { throw new Error('Tauri not available'); }
`;
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tauriNotifStub()],
  server: {
    hmr: false,
    proxy: {
      // Semua /api/* di-proxy ke Express dev server (port 3000).
      // Di Vercel, /api/* langsung ke serverless functions.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        /*
         * `return undefined` = "jangan dikumpulkan ke chunk mana pun".
         *
         * Semua paket di daftar itu hanya dibutuhkan setelah pengguna menekan
         * tombolnya: QRIS (`qrcode-generator`) saat tombol QRIS ditekan, PDF
         * (`jspdf` + `canvg` + `html2canvas` + `dompurify`) saat laporan
         * diunduh. Semuanya sudah di-`lazy()` di sisi komponen.
         *
         * Kalau ikut dikumpulkan ke `vendor`, semuanya jadi satu berkas yang
         * di-*preload* bersama layar login — dan `qrcode-generator` ikut terunduh
         * oleh orang yang tidak akan pernah menekan tombol itu. `vendor` sendiri
         * di-*preload* oleh `index.html`, jadi apa pun yang masuk ke sana tidak
         * bisa ditunda.
         */
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('leaflet')) return 'leaflet';
            if (id.includes('firebase')) return 'firebase';
            if (id.includes('motion')) return 'motion';
            // Ditunggu sampai tombol ditekan — jangan dikumpulkan ke `vendor`.
            if (
              id.includes('qrcode-generator') ||
              id.includes('jspdf') ||
              id.includes('canvg') ||
              id.includes('dompurify') ||
              id.includes('html2canvas') ||
              id.includes('core-js')
            ) {
              return undefined;
            }
            return 'vendor';
          }
          if (id.includes('src/data/')) {
            return 'data';
          }
        }
      }
    }
  }
});

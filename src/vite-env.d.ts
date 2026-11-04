/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
  readonly VITE_APP_SECRET: string;
  readonly VITE_PAYLOAD_KEY?: string;
  readonly VITE_API_BASE_URL?: string;
  /** Origin server upstream e-Presensi untuk direct URL gambar captcha. */
  readonly VITE_EP_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '@tauri-apps/plugin-notification' {
  export function sendNotification(options: { title: string; body: string }): Promise<void>;
  export function isPermissionGranted(): Promise<boolean>;
  export function requestPermission(): Promise<string>;
}


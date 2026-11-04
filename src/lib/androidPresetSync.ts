/**
 * Sync data preset dan session ke Android SharedPreferences agar
 * native keepalive worker bisa eksekusi presensi langsung dari Kotlin
 * tanpa WebView — untuk kasus app di-swipe dari Recent Apps.
 *
 * SharedPreferences yang dipakai:
 *   - "pamungkas_session"  → api_key, imei, last_latlong, base_url
 *   - "pamungkas_presets"  → JSON array preset aktif + lokasi
 *   - "pamungkas_worker_log" → hasil eksekusi dari Kotlin (dibaca JS)
 */

interface AndroidPamungkasInterface {
  syncSession?: (json: string) => void;
  syncPresets?: (json: string) => void;
  readWorkerLog?: () => string;
  clearWorkerLog?: () => void;
}

function getBridge(): AndroidPamungkasInterface | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as any).AndroidPamungkas as AndroidPamungkasInterface | undefined;
}

export interface SessionData {
  apiKey: string;
  imei: string;
  lastLatLong: string;
  baseUrl: string;
}

export interface PresetSyncData {
  id: string;
  nama: string;
  tipe: string;
  workcodeId: string;
  jamMulai: string;
  jamSelesai: string;
  hariAktif: number[];
  aktif: boolean;
  /** Koordinat lokasi yang dipilih — sudah resolved, bukan hanya ID */
  lokasi: Array<{ id: string; nama: string; latitude: number; longitude: number }>;
}

export interface WorkerLogEntry {
  presetId: string;
  presetNama: string;
  tanggal: string;
  eksekusiPada: number;
  berhasil: boolean;
  pesan: string;
}

/** Sync session (api_key, imei, last_latlong) ke SharedPreferences Android. */
export function syncSessionToAndroid(session: SessionData): void {
  try {
    getBridge()?.syncSession?.(JSON.stringify(session));
  } catch (e) {
    console.warn('[PresetSync] syncSession error:', e);
  }
}

/** Sync daftar preset aktif + lokasi ke SharedPreferences Android. */
export function syncPresetsToAndroid(presets: PresetSyncData[]): void {
  try {
    getBridge()?.syncPresets?.(JSON.stringify(presets));
  } catch (e) {
    console.warn('[PresetSync] syncPresets error:', e);
  }
}

/** Baca log hasil eksekusi dari Kotlin Worker. */
export function readWorkerLog(): WorkerLogEntry[] {
  try {
    const raw = getBridge()?.readWorkerLog?.();
    if (!raw) return [];
    return JSON.parse(raw) as WorkerLogEntry[];
  } catch {
    return [];
  }
}

/** Hapus log setelah dibaca UI. */
export function clearWorkerLog(): void {
  try {
    getBridge()?.clearWorkerLog?.();
  } catch {
    // ignore
  }
}

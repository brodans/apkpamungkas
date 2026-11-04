/**
 * Modul komunikasi dengan e-Presensi BKD Madiun.
 *
 * Semua path /ep/* diproxy ke https://presensi.bkd.madiunprov.go.id
 * - Local dev: lewat proxy dev-server Vite (vite.config.ts)
 * - Vercel: lewat serverless function api/ep.ts
 *
 * Captcha:
 * - Local dev: dipecahkan otomatis via OCR lokal (ocr_service.py, ddddocr)
 * - Vercel/production: diketik manual  OCR tidak di-deploy, bukan karena tidak
 *   bisa jalan, tapi karena modelnya 844 MB dan storage Function tidak sanggup
 *   menanggungnya. Lihat `OCR_LOKAL` di `WebPresensi.tsx`.
 */

import { apiUrl } from './apiBase';

// APK harus menuju proxy production, bukan tauri://localhost/ep.
// Browser tetap memakai path relatif saat VITE_API_BASE_URL tidak diisi.
const PROXY = `${apiUrl('/ep').replace(/\/$/, '')}`;

/**
 * Base URL untuk request data setelah login.
 * Pakai proxy /ep agar tidak kena CORS (browser tidak bisa cross-origin
 * ke absen.madiunkab.go.id). Login tetap langsung ke upstream karena
 * Cloudflare Bot Management memblokir proxy untuk POST.
 */
const DATA_BASE = PROXY;

/** URL proxy ep untuk dipakai di luar modul ini (misal konstruksi URL gambar). */
export const EP_PROXY_BASE = PROXY;

const PESAN_JARINGAN =
  'Tidak bisa menjangkau server e-Presensi lewat proxy /ep. ' +
  'Pastikan aplikasi dijalankan dengan "npm run dev" atau gunakan Vercel deployment.';

/** fetch dengan credentials include dan pesan error yang jelas. */
async function req(url: string, opts: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { credentials: 'include', ...opts });
  } catch (e) {
    const err = new Error(PESAN_JARINGAN);
    (err as Error & { sebab: unknown }).sebab = e;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Utilitas penguraian HTML
// ---------------------------------------------------------------------------

/** Buang tag & entitas, ubah <br>/<hr> menjadi pemisah baris. */
export function teks(html: string): string {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/[ \t\u00a0]+/g, ' ')
    .split('\n')
    .map((b) => b.trim())
    .filter((b) => b.length)
    .join('\n')
    .trim();
}

/** Satu baris teks (semua spasi/baris baru diringkas). */
export function teksSatu(html: string): string {
  return teks(html).replace(/\s+/g, ' ').trim();
}

/** Ambil isi <td> yang memiliki kelas sf_admin_list_td_<kelas>. */
function selAdmin(baris: string, kelas: string): string {
  const re = new RegExp(`<td[^>]*sf_admin_list_td_${kelas}\\b[^>]*>([\\s\\S]*?)<\\/td>`, 'i');
  const m = baris.match(re);
  return m ? m[1] : '';
}

/** Pisah isi sel berdasarkan <br> atau <hr>, lalu bersihkan tiap bagian. */
function bagian(html: string): string[] {
  return String(html)
    .split(/<br\s*\/?>|<hr\s*\/?>/i)
    .map((b) => teksSatu(b))
    .filter((b) => b.length);
}

/** Ambil semua <td> mentah (termasuk tagnya) dari sebuah <tr>. */
function selMentah(baris: string): string[] {
  return baris.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [];
}

/** Jumlah halaman maksimum dari tautan paginasi (?page=N). */
export function hitungTotalHalaman(html: string): number {
  let maks = 1;
  const re = /[?&]page=(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > maks) maks = n;
  }
  return maks;
}

/** Apakah HTML tersebut justru halaman login (sesi habis). */
function isHalamanLogin(html: string): boolean {
  return html.includes('m_user[email]') && html.includes('m_user[CAPTCHA]');
}

type ApiError = Error & { sesiHabis?: boolean; perluCaptchaBaru?: boolean; jenis?: string };

function pesanLoginLebihJelas(pesan: string): string {
  const teks = pesan.toLowerCase().replace(/\s+/g, ' ');
  const polaNip = /(?:email|e-?mail|nip|username|user|akun).{0,60}(?:salah|keliru|tidak valid|tidak cocok|tidak ditemukan|tidak terdaftar|invalid|incorrect|wrong|not found|not registered|does not exist)|(?:salah|keliru|tidak valid|tidak cocok|tidak ditemukan|tidak terdaftar|invalid|incorrect|wrong|not found|not registered|does not exist).{0,60}(?:email|e-?mail|nip|username|user|akun)/i;
  const polaPassword = /(?:password|kata sandi|sandi).{0,60}(?:salah|keliru|tidak valid|tidak cocok|tidak sesuai|invalid|incorrect|wrong)|(?:salah|keliru|tidak valid|tidak cocok|tidak sesuai|invalid|incorrect|wrong).{0,60}(?:password|kata sandi|sandi)/i;
  const polaCaptcha = /(?:captcha|capcha|kode verifikasi).{0,60}(?:salah|keliru|tidak valid|tidak cocok|invalid|incorrect|wrong)|(?:salah|keliru|tidak valid|tidak cocok|invalid|incorrect|wrong).{0,60}(?:captcha|capcha|kode verifikasi)/i;
  const kategori = [polaNip.test(teks), polaPassword.test(teks), polaCaptcha.test(teks)];
  if (kategori.filter(Boolean).length !== 1) return pesan;
  if (kategori[0]) return 'Email / NIP tidak terdaftar.';
  if (kategori[1]) return 'Password salah.';
  return 'Captcha salah.';
}

function teksErrorLogin(html: string): string {
  const pesan: string[] = [];
  const elemenError = /<(?:div|span|p)\b(?=[^>]*\bclass\s*=\s*(["'])[^"']*(?:alert-danger|help-block|invalid-feedback|text-danger|error)[^"']*\1)[^>]*>([\s\S]*?)<\/(?:div|span|p)>/gi;
  for (const cocok of html.matchAll(elemenError)) {
    const teks = cocok[2]
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;|&#34;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
    if (teks) pesan.push(teks);
  }
  return pesan.join(' ');
}

/** Lempar error bertanda sesiHabis bila respons ternyata halaman login. */
function pastikanBukanLogin(html: string): void {
  if (isHalamanLogin(html)) {
    const err = new Error('Sesi berakhir, silakan login ulang.') as ApiError;
    err.sesiHabis = true;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 1. Captcha + login
// ---------------------------------------------------------------------------

export interface CaptchaResult {
  /** URL gambar captcha — data URL (base64) atau blob URL. */
  url: string;
  /** Blob gambar untuk keperluan OCR lokal (ocr_service.py). */
  blob: Blob | null;
  /** Teks OCR dari server (kosong jika OCR tidak tersedia). */
  ocrText: string;
}

/**
 * URL origin server upstream — dibaca dari env sisi peramban, fallback ke
 * nilai kontrak. Dipakai untuk mengambil gambar captcha **langsung dari
 * browser** tanpa melewati proxy, sehingga browser dapat meneruskan cookie
 * `cf_clearance` miliknya sendiri dan Cloudflare tidak memblokir.
 */
const UPSTREAM_ORIGIN: string = (() => {
  try {
    const base = (import.meta.env?.VITE_EP_ORIGIN ?? '').trim();
    if (base) return new URL(base).origin;
  } catch { /* pakai fallback */ }
  // Fallback ke origin yang diketahui dari env PRESENSI_BASE_URL (sisi server)
  // atau konstanta kontrak. Di peramban tidak ada process.env, jadi pakai
  // konstanta yang sama dengan EP_TARGET_BAWAAN di epTarget.ts.
  return 'https://absen.madiunkab.go.id';
})();

/**
 * Coba pecahkan captcha otomatis via layanan OCR lokal (ocr_service.py).
 * Hanya bekerja di dev lokal — di production endpoint tidak ada.
 * Mengembalikan null jika gagal (OCR tidak tersedia / timeout).
 */
export async function ocrCaptchaOtomatis(imageBlob: Blob): Promise<string | null> {
  try {
    const ocrUrl = `${apiUrl('/api/ocr')}`;
    const buf = await imageBlob.arrayBuffer();
    const res = await fetch(ocrUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buf,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { ok?: boolean; result?: string; text?: string };
    if (!data.ok) return null;
    const teks = (data.result ?? data.text ?? '').toString().trim();
    return teks || null;
  } catch {
    return null;
  }
}

/** Minta session baru lalu ambil gambar captcha + OCR otomatis. */
export async function muatCaptcha(): Promise<CaptchaResult> {
  // Init sesi lewat proxy agar cookie epresensi-bkdmadiun tersimpan di browser.
  try {
    await req(`${DATA_BASE}/p/`);
  } catch {
    // Sesi lama mungkin masih valid.
  }

  const rand = Math.random();
  const captchaProxyUrl = `${apiUrl('/api/captcha')}?r=${rand}&reload=1`;

  // Server return JSON { ok, imageBase64, mimeType, ocrText }
  // imageBase64 → data URL untuk <img>
  // ocrText → teks OCR yang langsung bisa diisi ke field captcha
  const response = await fetch(captchaProxyUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const json = await response.json() as {
    ok: boolean;
    imageBase64?: string;
    mimeType?: string;
    ocrText?: string;
  };
  if (!json.ok || !json.imageBase64) {
    throw new Error('respons tidak valid dari proxy captcha');
  }

  const dataUrl = `data:${json.mimeType ?? 'image/gif'};base64,${json.imageBase64}`;
  // Konversi base64 ke Blob untuk kompatibilitas OCR lokal (ocr_service.py)
  const byteString = atob(json.imageBase64);
  const arr = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) arr[i] = byteString.charCodeAt(i);
  const blob = new Blob([arr], { type: json.mimeType ?? 'image/gif' });

  return {
    url: dataUrl,
    blob,
    ocrText: json.ocrText ?? '',
  };
}

/**
 * POST login ke server e-Presensi.
 *
 * Request dikirim LANGSUNG dari browser ke upstream (bukan lewat proxy /ep),
 * karena Cloudflare Bot Management memvalidasi POST lewat JS challenge yang
 * hanya bisa diselesaikan browser asli. Browser membawa cookie `cf_clearance`
 * miliknya sendiri — proxy server tidak bisa melakukan ini.
 *
 * `credentials: 'include'` memastikan cookie `epresensi-bkdmadiun` (sesi
 * captcha) ikut dikirim ke upstream.
 */
export async function login({ nip, password, captcha }: { nip: string; password: string; captcha: string }): Promise<boolean> {
  const body = new URLSearchParams({
    'm_user[email]': nip.replace(/\s/g, ''),
    'm_user[password]': password.replace(/\s/g, ''),
    'm_user[CAPTCHA]': captcha.replace(/\s/g, ''),
  });

  // POST langsung ke upstream — browser membawa cf_clearance otomatis
  const res = await fetch(`${UPSTREAM_ORIGIN}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': `${UPSTREAM_ORIGIN}/login`,
      'Origin': UPSTREAM_ORIGIN,
    },
    body: body.toString(),
    credentials: 'include',
    redirect: 'manual', // tangani redirect manual
  });

  // Redirect setelah login berhasil = ke halaman utama (bukan /login lagi)
  if (res.status === 302 || res.status === 301) {
    const location = res.headers.get('location') ?? '';
    if (location && !location.includes('/login')) {
      // Login berhasil — sync session cookie ke proxy path /ep juga
      // dengan GET /ep/ agar cookie tersedia untuk request berikutnya
      try { await req(`${DATA_BASE}/`, { credentials: 'include' }); } catch { /* ignore */ }
      return true;
    }
    // Redirect ke /login = gagal (captcha/kredensial salah)
  }

  // Baca body untuk cek pesan error
  let html = '';
  try { html = await res.text(); } catch { /* ignore */ }

  if (res.status === 403) {
    const err = new Error('Login ditolak server (403). Muat ulang captcha dan coba lagi.') as ApiError;
    err.perluCaptchaBaru = true;
    throw err;
  }

  if (isHalamanLogin(html)) {
    const pesan = teksErrorLogin(html) || 'Login gagal (periksa NIP, password, dan captcha).';
    const err = new Error(pesanLoginLebihJelas(pesan)) as ApiError;
    err.perluCaptchaBaru = true;
    err.jenis = /captcha/i.test(pesan) ? 'captcha' : 'kredensial';
    throw err;
  }

  if (!res.ok && res.status !== 302) {
    throw new Error(`Login gagal menghubungi server e-Presensi (HTTP ${res.status}).`);
  }

  return true;
}

/** Logout untuk mengakhiri session. */
export async function logout(): Promise<void> {
  try {
    await fetch(`${DATA_BASE}/p/default/logout`, { credentials: 'include' });
  } catch {
    /* biarkan: sesi akan hangat sendiri */
  }
}

// ---------------------------------------------------------------------------
// 2. Halaman kehadiran (checkinout)
// ---------------------------------------------------------------------------

export interface BarisKehadiran {
  id: string | null;
  idMap: string | null;
  nama: string;
  nip: string;
  statusPegawai: string;
  lat: number | null;
  lng: number | null;
  alamatPresensi: string;
  unitKerja: string;
  alamatRumah: string;
  jarak: string;
  checktype: string;
  imei: string;
  disetujui: boolean | null;
  waktuApproval: string;
  created_at: string;
  timezone: string;
  wfh: string;
  workCode: string;
}

export interface ProfilPegawaiWeb {
  nama: string;
  nip: string;
}

export interface HasilImei {
  imei: string | null;
  profil: ProfilPegawaiWeb | null;
}

export interface HasilKehadiran {
  baris: BarisKehadiran[];
  halaman: number;
  totalHalaman: number;
}

/** Ekstrak daftar nilai kolom IMEI dari HTML checkinout. */
export function extractImeis(html: string): string[] {
  const norm = html.replace(/\s+/g, ' ');
  const re = /sf_admin_list_td_imei">\s*([^<]+?)\s*<\//g;
  const hasil: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) {
    const v = m[1].trim();
    if (v && v !== '-') hasil.push(v);
  }
  return [...new Set(hasil)];
}

/** Nama & NIP pegawai dari sel pertama tabel kehadiran. */
export function extractProfil(html: string): ProfilPegawaiWeb | null {
  const norm = html.replace(/\s+/g, ' ');
  const m = norm.match(/>\s*([^<>]{3,90}?)\s*<br>\s*(\d{18})\s*<br>/);
  if (m) return { nama: m[1].trim(), nip: m[2] };
  return null;
}

/** Uraikan SELURUH baris tabel kehadiran menjadi objek terstruktur. */
export function parseKehadiran(html: string): BarisKehadiran[] {
  const hasil: BarisKehadiran[] = [];
  const barisSemua = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const r of barisSemua) {
    if (!/sf_admin_list_td_imei/i.test(r)) continue;

    const selPegawai = bagian(selAdmin(r, 'pegawai_id'));
    const selLatlong = selAdmin(r, 'latlong');
    const koord = selLatlong.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    const idMap = (selLatlong.match(/latlong=(\d+)/i) || [])[1] || null;
    const bagianLatlong = bagian(selLatlong);
    const alamatPresensi = bagianLatlong.slice(1).join(' ').replace(/^[-\d.,\s]+/, '').trim();

    const selDept = bagian(selAdmin(r, 'departemen'));
    const selApproval = selAdmin(r, 'approval');
    const bagianApproval = bagian(selApproval);
    const disetujui = /fa-check/i.test(selApproval)
      ? true
      : /fa-times/i.test(selApproval)
        ? false
        : null;

    hasil.push({
      id: (r.match(/name="ids\[\]"\s+value="(\d+)"/i) || [])[1] || idMap || null,
      idMap,
      nama: selPegawai[0] || '',
      nip: selPegawai[1] || '',
      statusPegawai: selPegawai[2] || '',
      lat: koord ? parseFloat(koord[1]) : null,
      lng: koord ? parseFloat(koord[2]) : null,
      alamatPresensi,
      unitKerja: selDept[0] || '',
      alamatRumah: selDept[1] || '',
      jarak: teksSatu(selAdmin(r, 'jarak')),
      checktype: teksSatu(selAdmin(r, 'checktype')),
      imei: teksSatu(selAdmin(r, 'imei')),
      disetujui,
      waktuApproval: bagianApproval.find((b) => /\d{4}/.test(b)) || '',
      created_at: teksSatu(selAdmin(r, 'created_at')),
      timezone: teksSatu(selAdmin(r, 'timezone')),
      wfh: teksSatu(selAdmin(r, 'iswfh')),
      workCode: teksSatu(selAdmin(r, 'work_code')),
    });
  }
  return hasil;
}

/** Ambil IMEI kehadiran dari HALAMAN PERTAMA saja. */
export async function ambilImei(): Promise<HasilImei> {
  const res = await req(`${DATA_BASE}/p/checkinout`);
  if (!res.ok) throw new Error(`Gagal memuat kehadiran (HTTP ${res.status})`);
  const html = await res.text();
  pastikanBukanLogin(html);
  const profil = extractProfil(html);
  const imeis = extractImeis(html);
  return { imei: imeis[0] || null, profil };
}

/** Ambil satu halaman daftar kehadiran lengkap. */
export async function ambilKehadiran({ halaman = 1 }: { halaman?: number } = {}): Promise<HasilKehadiran> {
  const url = `${DATA_BASE}/p/checkinout${halaman > 1 ? `?page=${halaman}` : ''}`;
  const res = await req(url);
  if (!res.ok) throw new Error(`Gagal memuat kehadiran (HTTP ${res.status})`);
  const html = await res.text();
  pastikanBukanLogin(html);
  return {
    baris: parseKehadiran(html),
    halaman,
    totalHalaman: hitungTotalHalaman(html),
  };
}

export interface KoordinatPresisi {
  lat: number | null;
  lng: number | null;
}

/** Uraikan koordinat dari fragmen latlong. */
export function parseLatlong(html: string): KoordinatPresisi {
  const lat = (html.match(/Latitude\s*:\s*(-?\d+(?:\.\d+)?)/i) || [])[1];
  const lng = (html.match(/Longitude\s*:\s*(-?\d+(?:\.\d+)?)/i) || [])[1];
  return {
    lat: lat ? parseFloat(lat) : null,
    lng: lng ? parseFloat(lng) : null,
  };
}

/** Ambil koordinat presisi untuk satu baris kehadiran. */
export async function ambilLatlong(idMap: string): Promise<KoordinatPresisi> {
  const res = await req(
    `${DATA_BASE}/p/checkinout/load/action?latlong=${encodeURIComponent(idMap)}`,
  );
  if (!res.ok) throw new Error(`Gagal memuat lokasi (HTTP ${res.status})`);
  return parseLatlong(await res.text());
}

// ---------------------------------------------------------------------------
// 3. Halaman detail pegawai
// ---------------------------------------------------------------------------

export interface TabelData {
  header: string[];
  baris: string[][];
}

export interface DetailPegawai {
  profil: Record<string, string>;
  foto: string | null;
  idPegawai: string | null;
  urlIjin: string | null;
  logLogin: TabelData | null;
  fotoUpload: TabelData | null;
}

/** Cari tabel berdasarkan salah satu judul kolomnya. */
export function tabelDenganHeader(html: string, pola: RegExp): TabelData | null {
  const tabelSemua = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  for (const t of tabelSemua) {
    const header = (t.match(/<th[^>]*>[\s\S]*?<\/th>/gi) || []).map((x) => teksSatu(x));
    if (!header.some((h) => pola.test(h))) continue;
    const baris = (t.match(/<tr[\s\S]*?<\/tr>/gi) || [])
      .filter((r) => /<td/i.test(r))
      .map((r) => selMentah(r).map((c) => teksSatu(c)));
    return { header, baris };
  }
  return null;
}

/** Uraikan halaman "Detail Pegawai". */
export function parseDetailPegawai(html: string): DetailPegawai {
  const profil: Record<string, string> = {};
  const reProfil =
    /<td[^>]*>\s*([^<>]{1,40}?)\s*<\/td>\s*<td[^>]*>\s*:\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  let mp: RegExpExecArray | null;
  while ((mp = reProfil.exec(html))) {
    const label = teksSatu(mp[1]);
    if (label) profil[label] = teksSatu(mp[2]);
  }

  const foto = (html.match(/<img[^>]*width="150px"[^>]*src="([^"]+)"/i) || [])[1] || null;
  const idPegawai = (html.match(/\/index\.php\/pegawai\/(\d+)\/ijins/i) || [])[1] || null;
  const urlIjin = idPegawai ? `/p/pegawai/${idPegawai}/ijins` : null;

  return {
    profil,
    foto,
    idPegawai,
    urlIjin,
    logLogin: tabelDenganHeader(html, /^imei$/i),
    fotoUpload: tabelDenganHeader(html, /tanggal upload/i),
  };
}

/** Ambil halaman "Detail Pegawai" milik akun yang login. */
export async function ambilDetailPegawai(): Promise<DetailPegawai> {
  const res = await req(`${DATA_BASE}/p/pegawai/details/action`);
  if (!res.ok) throw new Error(`Gagal memuat detail pegawai (HTTP ${res.status})`);
  const html = await res.text();
  pastikanBukanLogin(html);
  return parseDetailPegawai(html);
}

// ---------------------------------------------------------------------------
// 4. Halaman perizinan + berkas lampiran
// ---------------------------------------------------------------------------

export interface BarisIjin {
  id: string | null;
  nama: string;
  nip: string;
  unitKerja: string;
  tipeIjin: string;
  jenisIjin: string;
  tglIjin: string;
  alasan: string;
  catatan: string;
  berkas: string | null;
  disetujui: boolean | null;
  approvalAt: string;
  createdAt: string;
}

export interface HasilPerizinan {
  baris: BarisIjin[];
  halaman: number;
  totalHalaman: number;
}

/** Ambil tautan berkas (uploads/...) pertama dari sebuah sel. */
function ambilBerkasDari(html: string): string | null {
  const m = String(html).match(/(?:href|src)="([^"]*uploads\/[^"]+)"/i);
  return m ? m[1] : null;
}

/** Status approval dari ikon fa-check / fa-times (null bila tidak jelas). */
function statusApproval(html: string): boolean | null {
  if (/fa-check/i.test(html)) return true;
  if (/fa-times/i.test(html)) return false;
  return null;
}

/** Uraikan baris tabel perizinan. */
export function parsePerizinan(html: string): BarisIjin[] {
  const hasil: BarisIjin[] = [];
  const barisSemua = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const r of barisSemua) {
    if (/sf_admin_list_td_jenis_ijin/i.test(r)) {
      const nama = bagian(selAdmin(r, 'nama'));
      hasil.push({
        id: (r.match(/name="ids\[\]"\s+value="(\d+)"/i) || [])[1] || null,
        nama: nama[0] || '',
        nip: nama[1] || '',
        unitKerja: teksSatu(selAdmin(r, 'MDepartemen')),
        tipeIjin: teksSatu(selAdmin(r, 'tipe_ijin')),
        jenisIjin: teksSatu(selAdmin(r, 'jenis_ijin')),
        tglIjin: teksSatu(selAdmin(r, 'tgl_ijin')),
        alasan: teksSatu(selAdmin(r, 'alasan')),
        catatan: teksSatu(selAdmin(r, 'catatan')),
        berkas: ambilBerkasDari(selAdmin(r, 'berkas')),
        disetujui: statusApproval(selAdmin(r, 'approval')),
        approvalAt: teksSatu(selAdmin(r, 'approval_at')),
        createdAt: teksSatu(selAdmin(r, 'created_at')),
      });
      continue;
    }

    const sel = selMentah(r);
    if (sel.length < 8 || !/uploads\/|scope="row"/i.test(r)) continue;
    const nilai = sel.map((c) => teksSatu(c));
    hasil.push({
      id: null,
      nama: '',
      nip: '',
      unitKerja: nilai[1] || '',
      tipeIjin: nilai[2] || '',
      jenisIjin: nilai[3] || '',
      tglIjin: nilai[4] || '',
      alasan: nilai[5] || '',
      catatan: '',
      berkas: ambilBerkasDari(sel[6] || ''),
      disetujui: statusApproval(sel[7] || ''),
      approvalAt: '',
      createdAt: nilai[8] || nilai[7] || '',
    });
  }
  return hasil;
}

/** Ambil "Daftar Ijin" milik pegawai (dimuat via ajax oleh halaman detail). */
export async function ambilIjinPegawai(idPegawai: string): Promise<{ baris: BarisIjin[]; html: string }> {
  const res = await req(`${DATA_BASE}/p/pegawai/${encodeURIComponent(idPegawai)}/ijins`);
  if (!res.ok) throw new Error(`Gagal memuat daftar ijin (HTTP ${res.status})`);
  const html = await res.text();
  pastikanBukanLogin(html);
  return { baris: parsePerizinan(html), html };
}

/** Ambil satu halaman daftar perizinan. */
export async function ambilPerizinan({ halaman = 1 }: { halaman?: number } = {}): Promise<HasilPerizinan> {
  const url = `${DATA_BASE}/p/perizinan${halaman > 1 ? `?page=${halaman}` : ''}`;
  const res = await req(url);
  if (!res.ok) throw new Error(`Gagal memuat perizinan (HTTP ${res.status})`);
  const html = await res.text();
  pastikanBukanLogin(html);
  return {
    baris: parsePerizinan(html),
    halaman,
    totalHalaman: hitungTotalHalaman(html),
  };
}

/**
 * Ubah path berkas menjadi URL same-origin lewat proxy.
 */
export function urlBerkas(path: string): string | null {
  if (!path) return null;
  let p = String(path);
  if (/^https?:\/\//i.test(p)) {
    try {
      p = new URL(p).pathname;
    } catch {
      /* biarkan apa adanya */
    }
  }
  if (/^\/ep\//.test(p)) return `${DATA_BASE}${p.replace(/^\/ep/, '')}`;
  if (!p.startsWith('/')) p = '/' + p;
  return `${DATA_BASE}${p}`;
}

export interface HasilBerkas {
  blob: Blob;
  tipe: string;
  url: string;
}

/** Ambil berkas lampiran lewat proxy (sesi ikut terkirim). */
export async function ambilBerkas(path: string): Promise<HasilBerkas> {
  const url = urlBerkas(path);
  if (!url) throw new Error('Path berkas tidak valid');
  const res = await req(url);
  if (!res.ok) throw new Error(`Gagal memuat berkas (HTTP ${res.status})`);
  const tipe = res.headers.get('content-type') || '';
  const blob = await res.blob();
  return { blob, tipe, url: URL.createObjectURL(blob) };
}

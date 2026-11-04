/**
 * Identitas aplikasi — sumber tunggal untuk nama, versi, dan logo.
 *
 * ## Nama: `PAMUNGKAS` / *Portal Presensi Kabupaten Madiun*
 *
 * Yang **tidak** boleh diubah tanpa migrasi:
 *
 * - `createHmac('sha256', 'pamungkas-kredensial')` di `panelServer.ts` —
 *   turunan kunci enkripsi kredensial server. Mengubahnya membuat setiap
 *   password server pusat yang tersimpan tidak bisa didekripsi lagi, dan
 *   auto-login semua orang langsung mati.
 * - `PREFIX_ORDER_ID = 'PAMUNGKAS'` — awalan `order_id`. Mengubahnya membuat
 *   tagihan yang sudah tersimpan tidak dikenali lagi.
 *
 * Aplikasi tidak memakai nama "E-Presensi" di mana pun yang dilihat
 * pengguna. "E-Presensi Kab. Madiun" di `presensiContract.ts` adalah nama
 * *aplikasi Android resmi* yang di-wrap — itu fakta teknis, bukan merek
 * aplikasi ini.
 */

/** Nama singkat — judul, nama PWA, logo sidebar, dan nama merchant QRIS. */
export const APP_NAME = 'PAMUNGKAS';

/** Nama panjang yang tampil di layar. */
export const APP_FULL_NAME = 'Portal Presensi Kabupaten Madiun';

/** Versi aplikasi. */
export const APP_VERSION = '1.0.0';

/**
 * Logo aplikasi, dari `public/assets/`.
 *
 * Path yang sama juga muncul di `index.html` dan `manifest.json`, yang
 * tidak melewati bundler. `cek-identitas.ts` memverifikasi ketiganya
 * menunjuk file yang benar-benar ada.
 */
export const APP_LOGO = '/assets/icon-192.png';

/**
 * Daftar handler yang jadi Vercel Serverless Function.
 *
 * Satu-satunya sumber kebenaran. Dipakai oleh `build.mts` saat membundel dan
 * oleh `tools/cek-vercel-selfcontained.mts` saat menghitung  supaya keduanya
 * tidak bisa berbeda dalam diam-diam.
 *
 *  Nama berawalan `_` **bukan** function. `_cors.ts` dan `_panel.ts` adalah
 * helper yang di-bundle bersama handler yang memakainya, dan Vercel tidak
 * memperlakukan berkasnya sebagai endpoint.
 *
 * Berkas ini sendiri ikut aturan itu: ia tidak handler, hanya daftar.
 */

/**
 * Yang bukan handler, selain yang sudah berawalan `_`.
 *
 * `build.mts` ikut dikecualikan: ia adalah perkakas build, bukan endpoint.
 * Kalau ikut ter-bundle, `api/build.mts` ter-deploy sebagai handler yang tidak
 * melakukan apa-apa selain menulis bundel baru ke `api/`.
 */
const BUKAN_HANDLER = new Set(['build.mts', '_handlers.ts']);

/**
 * Nama handler tanpa ekstensi  persis nama berkas di `api/`.
 *
 * Satu-satunya tempat aturan "apa yang jadi endpoint" ditulis. Dipakai oleh
 * `build.mts` saat membundel, dan oleh dua skrip penjaga yang menghitung
 * jumlah sumber vs jumlah hasil. Kalau aturannya ditulis ulang di salah satu
 * dari tiga tempat itu, mereka bisa berbeda tanpa ada yang salah  dan
 * `build.mts` diam-diam menulis endpoint yang tidak pernah dimaksud
 * (seperti yang terjadi dengan `api/build.js`).
 */
export function daftarHandler(namaBerkas: readonly string[]): string[] {
  return namaBerkas
    .filter(f => f.endsWith('.ts') && !f.startsWith('_') && !BUKAN_HANDLER.has(f))
    .map(f => f.replace(/\.ts$/, ''))
    .sort();
}
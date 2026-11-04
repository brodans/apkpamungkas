/**
 * ⚠️ BERKAS HASIL BUILD — JANGAN DIEDIT, jangan diimpor dari mana pun.
 *
 * Dibuat oleh `src/serverless/build.mts` dari `src/serverless/<nama>.ts`.
 * Sumbernya ada di `src/serverless/`; ubah sana, lalu jalankan `npm run build`.
 *
 * Alasan berkas ini harus mandiri ada di `src/serverless/build.mts`: Vercel
 * hanya mengompilasi `api/*.ts` tanpa meng-bundle, dan Node ESM tidak bisa
 * me-resolve impor relatif tanpa ekstensi — hasilnya 500
 * `FUNCTION_INVOCATION_FAILED` untuk SELURUH endpoint.
 *
 * Isinya JavaScript hasil bundel, bukan TypeScript tulis-tangan — itu sebabnya
 * `@ts-nocheck` tepat di bawah banner ini.
 */
// @ts-nocheck
/* eslint-disable */
// src/serverless/captcha.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import path from "node:path";

// src/lib/epTarget.ts
var EP_TARGET_BAWAAN = "https://absen.madiunkab.go.id";
function asalDari(nilai, namaVar) {
  try {
    return new URL(nilai).origin;
  } catch {
    throw new Error(
      `${namaVar} bukan URL yang valid: ${JSON.stringify(nilai)}. Contoh yang benar: ${EP_TARGET_BAWAAN}`
    );
  }
}
function epTargetOrigin() {
  const khusus = process.env.EP_TARGET_ORIGIN?.trim();
  if (khusus) return asalDari(khusus, "EP_TARGET_ORIGIN");
  const dasar = process.env.PRESENSI_BASE_URL?.trim();
  if (dasar) return asalDari(dasar, "PRESENSI_BASE_URL");
  return EP_TARGET_BAWAAN;
}

// src/serverless/captcha.ts
var execFileAsync = promisify(execFile);
var UPSTREAM_ORIGIN = new URL(epTargetOrigin()).origin;
async function handler(req, res) {
  const urlObj = new URL(req.url ?? "/", `http://localhost`);
  const r = urlObj.searchParams.get("r") ?? String(Math.random());
  const reload = urlObj.searchParams.get("reload") ?? "1";
  const upstreamUrl = `${UPSTREAM_ORIGIN}/captcha?r=${r}&reload=${reload}`;
  const tmpFile = path.join(tmpdir(), `captcha_${randomUUID()}.gif`);
  const args = [
    "--silent",
    "--max-time",
    "10",
    "--location",
    "-H",
    "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
    "-H",
    "Accept: image/jxl,image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "-H",
    "Accept-Language: id-ID,id;q=0.9,en;q=0.8",
    "-H",
    `Referer: ${UPSTREAM_ORIGIN}/login`,
    "-H",
    "Sec-Fetch-Dest: image",
    "-H",
    "Sec-Fetch-Mode: no-cors",
    "-H",
    "Sec-Fetch-Site: same-origin",
    "-w",
    "%{http_code}|%{content_type}",
    "--output",
    tmpFile,
    upstreamUrl
  ];
  try {
    const { stdout } = await execFileAsync("curl", args, { encoding: "utf8", maxBuffer: 64 * 1024 });
    const [statusStr, contentType] = stdout.trim().split("|");
    const statusCode = parseInt(statusStr, 10);
    const imgBuf = readFileSync(tmpFile);
    unlinkSync(tmpFile);
    if (statusCode !== 200 || imgBuf.length < 50) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: `Upstream ${statusCode}` }));
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", contentType?.trim() || "image/gif");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(imgBuf);
  } catch (e) {
    try {
      unlinkSync(tmpFile);
    } catch {
    }
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e) }));
  }
}
export {
  handler as default
};

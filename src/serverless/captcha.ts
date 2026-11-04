/**
 * Vercel Serverless Function: /api/captcha
 *
 * Proxy gambar captcha dari upstream e-Presensi menggunakan curl.
 *
 * Node.js fetch (undici) diblokir Cloudflare Bot Management via TLS
 * fingerprint (JA3/JA4). curl menggunakan OpenSSL yang tidak diblokir.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { epTargetOrigin } from '../lib/epTarget';

const execFileAsync = promisify(execFile);
const UPSTREAM_ORIGIN = new URL(epTargetOrigin()).origin;

export default async function handler(
  req: IncomingMessage & { url?: string },
  res: ServerResponse
): Promise<void> {
  const urlObj = new URL(req.url ?? '/', `http://localhost`);
  const r = urlObj.searchParams.get('r') ?? String(Math.random());
  const reload = urlObj.searchParams.get('reload') ?? '1';

  const upstreamUrl = `${UPSTREAM_ORIGIN}/captcha?r=${r}&reload=${reload}`;
  const tmpFile = path.join(tmpdir(), `captcha_${randomUUID()}.gif`);

  const args = [
    '--silent', '--max-time', '10', '--location',
    '-H', 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
    '-H', 'Accept: image/jxl,image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    '-H', 'Accept-Language: id-ID,id;q=0.9,en;q=0.8',
    '-H', `Referer: ${UPSTREAM_ORIGIN}/login`,
    '-H', 'Sec-Fetch-Dest: image',
    '-H', 'Sec-Fetch-Mode: no-cors',
    '-H', 'Sec-Fetch-Site: same-origin',
    '-w', '%{http_code}|%{content_type}',
    '--output', tmpFile,
    upstreamUrl,
  ];

  try {
    const { stdout } = await execFileAsync('curl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 });
    const [statusStr, contentType] = stdout.trim().split('|');
    const statusCode = parseInt(statusStr, 10);

    const imgBuf = readFileSync(tmpFile);
    unlinkSync(tmpFile);

    if (statusCode !== 200 || imgBuf.length < 50) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Upstream ${statusCode}` }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', contentType?.trim() || 'image/gif');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(imgBuf);
  } catch (e: unknown) {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: String(e) }));
  }
}

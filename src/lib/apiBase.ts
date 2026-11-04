export function apiUrl(path: string): string {
  const configured = import.meta.env?.VITE_API_BASE_URL?.trim();

  // VITE_API_BASE_URL wajib diisi. Tidak ada fallback hardcode ke domain
  // tertentu — kalau kosong, path relatif dipakai (cocok untuk web dev dan
  // Vercel yang path /api/* sudah di-route serverless).
  if (!configured) return path.startsWith('/') ? path : `/${path}`;

  // Terima `app.example.go.id/` maupun URL lengkap. Vite menyuntik nilai ini
  // secara literal; fetch butuh URL absolut di APK.
  const base = /^[a-z][a-z\d+.-]*:\/\//i.test(configured)
    ? configured
    : `https://${configured}`;
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

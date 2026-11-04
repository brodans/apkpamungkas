import { useState } from 'react';

interface Props {
  /** URL gambar. Null/kosong → langsung tampilkan inisial. */
  src?: string | null;
  /** Teks inisial (maks 2 huruf). */
  inisial: string;
  /** Nama lengkap untuk alt text. */
  alt?: string;
  /** Ukuran Tailwind, misal "w-24 h-24" atau "w-10 h-10". */
  className?: string;
  /** Radius Tailwind, default "rounded-full". */
  rounded?: string;
  /** Ukuran teks inisial, default otomatis dari className. */
  textSize?: string;
}

/**
 * Menampilkan foto profil jika URL valid dan bisa diload.
 * Jika gagal (404, CORS, dsb.) → fallback ke avatar gradient + inisial.
 */
export default function FotoAtauInisial({
  src,
  inisial,
  alt,
  className = 'w-10 h-10',
  rounded = 'rounded-full',
  textSize,
}: Props) {
  const [gagal, setGagal] = useState(false);

  // Ukuran teks otomatis berdasarkan dimensi di className
  const fontSize = textSize ?? (
    className.includes('w-24') || className.includes('w-20') ? 'text-2xl' :
    className.includes('w-16') || className.includes('w-14') ? 'text-xl' :
    className.includes('w-12') ? 'text-lg' :
    className.includes('w-8')  ? 'text-[11px]' :
    'text-sm'
  );

  const hrf = inisial.slice(0, 2).toUpperCase() || '?';

  if (!src || gagal) {
    return (
      <div
        className={`${className} ${rounded} flex items-center justify-center shrink-0
          bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold shadow-sm
          ${fontSize}`}
        aria-label={alt ?? hrf}
        title={alt}
      >
        {hrf}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt ?? hrf}
      className={`${className} ${rounded} object-cover shrink-0
        border border-slate-200 dark:border-slate-700`}
      onError={() => setGagal(true)}
    />
  );
}

"use client";
import { PublicPage } from "@/components/public-shell";
export default function BlogError({ reset }: { reset: () => void }) {
  return <PublicPage active="Blog"><main className="public-main editorial-blog"><div className="editorial-container" role="alert"><h1>Artikel belum dapat dimuat</h1><p>Koneksi ke layanan blog bermasalah. Silakan coba lagi.</p><button type="button" className="button button-primary" onClick={reset}>Coba lagi</button></div></main></PublicPage>;
}

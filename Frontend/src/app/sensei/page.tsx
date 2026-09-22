import { PublicPage } from "@/components/public-shell";
import { SenseiGrid } from "@/components/sensei-grid";

export default function SenseiPage() {
  return <PublicPage><main className="public-main sensei-page"><section className="sensei-page-hero"><h1>Belajar Bersama Sensei Berpengalaman</h1><p>Temukan mentor sesuai level, target, dan gaya belajarmu.</p></section><section className="sensei-page-list" aria-label="Daftar Sensei Hiru Academy"><SenseiGrid /></section></main></PublicPage>;
}

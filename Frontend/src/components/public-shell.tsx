import Image from "next/image";
import Link from "next/link";
import { FaInstagram, FaWhatsapp } from "react-icons/fa";
import { BrandLogo } from "@/components/brand-logo";

export function PublicHeader({ active }: { active?: string }) {
  const links = [["Program", "/program"], ["Placement Test", "/placement"], ["Testimoni", "/testimoni"], ["Blog", "/blog"]];
  return <header className="public-header"><div className="public-wrap"><Link href="/" aria-label="Hiru Academy"><BrandLogo /></Link><nav aria-label="Navigasi utama">{links.map(([label, href]) => <Link className={active === label ? "active" : ""} key={href} href={href}>{label}</Link>)}</nav><Link className="public-login" href="/login">Login</Link></div></header>;
}

export function PublicFooter() {
  return <footer className="public-footer"><div className="public-wrap public-footer-grid"><div><Link href="/" aria-label="HIRU Academy, kembali ke beranda"><span className="official-brand-logo"><Image src="/brand/hiru-footer.png" alt="HIRU Academy" width={2212} height={356} /></span></Link><div className="public-social" aria-label="Media sosial belum tersedia"><span aria-hidden="true"><FaInstagram size={20} /></span><span aria-hidden="true"><FaWhatsapp size={20} /></span></div></div><nav aria-label="Navigasi footer"><Link href="/program">Program</Link><Link href="/placement">Placement Test</Link><Link href="/testimoni">Testimoni</Link><Link href="/blog">Blog</Link><Link href="/kebijakan-privasi">Kebijakan Privasi</Link></nav></div><div className="public-wrap"><div className="public-copyright">© 2026 Hiru Academy. Belajar Jepang dengan arah yang jelas.</div></div></footer>;
}

export function PublicPage({ children, active }: { children: React.ReactNode; active?: string }) { return <><PublicHeader active={active} />{children}<PublicFooter /></>; }

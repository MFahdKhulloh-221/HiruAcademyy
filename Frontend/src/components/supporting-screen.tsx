"use client";

import Link from "next/link";
import { useState } from "react";
import { LuArrowLeft, LuAward, LuBookOpen, LuCircleCheck, LuGraduationCap, LuReceipt, LuShieldCheck, LuTag } from "react-icons/lu";
import { useAuth } from "@/components/auth-provider";
import { StudentBreadcrumb } from "@/components/student-breadcrumb";
import { StudentNavigation } from "@/components/student-navigation";
import { StudentNotificationsScreen } from "@/components/student-notifications-screen";
import { StudentCertificateCenter } from "@/components/certificate-detail-screen";
import { LearningLibrary } from "@/components/learning-library";
import { PracticeScreen } from "@/components/practice-screen";
import { useCommercialAffiliate, useCommercialInvoice, useCommercialOrder } from "@/components/commercial-hooks";
import { commercialCode } from "@/lib/commercial-api";
import type { LearningAccess, LearningProgram } from "@/lib/learning-api";
import { supportingData, type SupportingKind } from "@/lib/supporting-mock";

type Membership = "free" | "lms" | "sensei";
type Props = { kind: SupportingKind; membership: Membership; access: LearningAccess; programs: LearningProgram[]; breadcrumbCurrent?: string; targetProgram?: string; invoiceId?: string };
const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const planLabel = (plan: Membership) => plan === "sensei" ? "Kelas bersama Sensei" : plan === "lms" ? "Belajar Mandiri" : "Free Member";

export function SupportingScreen(props: Props) {
  const { kind, membership } = props;
  if (kind === "library") return <LearningLibrary />;
  if (kind === "practice") return <PracticeScreen membership={membership} />;
  return <div className="supporting-shell student-shell"><StudentNavigation membership={membership} /><main className={`supporting-main ${kind === "renewal" ? "renewal" : kind}-page`}>
    {kind === "notifications" ? <StudentNotificationsScreen /> : kind === "certificate" ? <StudentCertificateCenter /> : kind === "profile" ? <ProfileScreen membership={membership} access={props.access} /> : kind === "affiliate" ? <AffiliateScreen /> : kind === "renewal" ? <RenewalScreen {...props} /> : <EmptySupportingScreen kind={kind} />}
  </main></div>;
}

function EmptySupportingScreen({ kind }: { kind: SupportingKind }) {
  const data = kind === "practice" ? { eyebrow: "LATIHAN", title: "Latihan", description: "" } : supportingData[kind];
  return <>{kind === "createPost" && <StudentBreadcrumb items={[{ label: "Diskusi Member", href: "/community" }, { label: "Buat Diskusi" }]} />}<header className="supporting-header"><p className="dash-kicker">{data.eyebrow}</p><h1>{data.title}</h1><p>{data.description}</p></header><section className="library-empty"><p role="status">OPEN: layanan ini belum tersedia. Belum ada data untuk ditampilkan.</p>{kind === "progress" && <Link className="button button-secondary" href="/journey">Perjalanan Level</Link>}</section></>;
}

function ProfileScreen({ membership, access }: { membership: Membership; access: LearningAccess }) {
  const { user } = useAuth();
  const initials = (user?.name ?? "").trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] ?? "").join("").toUpperCase();
  return <><header className="supporting-header"><p className="dash-kicker">AKUN &amp; MEMBERSHIP</p><h1>Profil dan status belajarmu</h1><p>Kelola informasi akun, status belajar, sertifikat, dan preferensi.</p></header>
    <section className="profile-identity"><span>{initials}</span><div><h2>{user?.name ?? ""}</h2><p>{user?.email ?? ""}</p><div className="profile-identity-tags">{access.source_grants.map((grant, index) => <span className="profile-pill" key={`${grant.program_code}/${grant.plan_code}/${index}`}>{commercialCode(grant.program_code)} • {planLabel(grant.plan_code === "sensei" ? "sensei" : "lms")}</span>)}</div></div></section>
    <section className="profile-membership"><div><p className="dash-kicker">STATUS MEMBERSHIP</p><h2>{planLabel(membership)}</h2></div><Link className="button button-primary" href="/renewal">Perpanjang Membership</Link></section>
    <section className="profile-certificates"><div className="profile-section-header"><h2>Sertifikat</h2></div><div className="profile-cert-footer"><Link className="button button-secondary profile-all-cert-btn" href="/certificate">Lihat Semua Sertifikat →</Link></div></section>
    <section className="profile-referral"><div className="profile-section-header"><div><p className="dash-kicker">PROGRAM AFFILIATE</p><h2>Kode referral saya</h2></div><Link className="button button-secondary" href="/affiliate">Buka Halaman Affiliate →</Link></div></section>
    <section className="profile-settings"><h2>Pengaturan akun</h2><div><Link href="/notifications"><div><strong>Notifikasi</strong><small>Atur pengingat belajar dan informasi kelas.</small></div></Link></div><p role="status">OPEN: edit profil dan preferensi belajar belum tersedia.</p></section>
  </>;
}

function AffiliateScreen() {
  const { data, error } = useCommercialAffiliate();
  return <><header className="supporting-header"><p className="dash-kicker">PROGRAM AFILIASI &amp; REFERRAL</p><h1>Program Affiliate Hiru Academy</h1><p>Bagikan kode atau link affiliate. Teman mendapat diskon pendaftaran, dan kamu memperoleh komisi.</p></header>
    {error && <p role="alert">{error}</p>}{!data && !error && <p role="status">Memuat…</p>}
    {data && <><section className="affiliate-share-card"><div className="affiliate-code-box"><label>Kode Referral Unik</label><div className="affiliate-input-row"><code>{data.code ?? "—"}</code></div></div></section><section className="profile-stats">{([ ["pending", "Komisi Belum Dicairkan"], ["approved", "Komisi valid"], ["paid", "Komisi Sudah Dicairkan"] ] as const).map(([key, label]) => <div key={key}><strong>{money(data.totals[key])}</strong><span>{label}</span></div>)}</section>{!data.affiliate && <section className="library-empty"><p>Belum ada data affiliate.</p></section>}</>}
  </>;
}

function RenewalScreen({ membership, access, programs, targetProgram, breadcrumbCurrent, invoiceId }: Props) {
  const requested = targetProgram?.toUpperCase();
  const [program, setProgram] = useState(programs.find(item => commercialCode(item.code) === requested)?.code ?? programs[0]?.code ?? "");
  const [plan, setPlan] = useState<"lms" | "sensei">("lms");
  const [referral, setReferral] = useState("");
  const [createdId, setCreatedId] = useState<string>();
  const order = useCommercialOrder(commercialCode(program), plan);
  const selectedInvoice = createdId ?? invoiceId;
  const label = programs.find(item => item.code === program)?.name ?? "—";
  async function create() {
    const invoice = await order.create(referral);
    if (invoice) {
      setCreatedId(String(invoice.id));
      const url = new URL(window.location.href);
      url.searchParams.set("invoice", String(invoice.id));
      window.history.replaceState(null, "", url);
    }
  }
  return <><div className="renewal-top-nav"><Link className="renewal-top-back" href="/profile"><LuArrowLeft aria-hidden="true" /><span>Kembali ke Profil</span></Link>{breadcrumbCurrent && <StudentBreadcrumb items={[{ label: "Membership", href: "/renewal" }, { label: breadcrumbCurrent }]} />}</div>
    <header className="supporting-header renewal-header"><p className="dash-kicker">MEMBERSHIP RENEWAL</p><h1>Lanjutkan Akses Tanpa Kehilangan Progres</h1><p>Harga dan periode baru tampil setelah plan dipilih; data berasal dari paket resmi HIRU Academy.</p></header>
    <section className="renewal-current-banner"><div className="banner-left"><div className="banner-shield-icon" aria-hidden="true"><LuShieldCheck /></div><div className="banner-copy"><h2>{planLabel(membership)}</h2>{access.source_grants.map((grant, index) => <p key={`${grant.program_code}/${grant.plan_code}/${index}`}>{commercialCode(grant.program_code)} • {planLabel(grant.plan_code === "sensei" ? "sensei" : "lms")}</p>)}</div></div></section>
    {selectedInvoice ? <RenewalInvoice key={selectedInvoice} id={selectedInvoice} /> : <>
      <section className="renewal-step-section"><div className="renewal-step-header"><div className="renewal-step-badge"><LuTag aria-hidden="true" /><span>STEP 1</span></div><h2>Pilih Program / Level</h2><p>Pilih program atau level lanjutan yang ingin kamu pelajari.</p></div><div className="renewal-program-grid">{programs.map(item => <button key={item.id} type="button" className={`renewal-program-card ${program === item.code ? "selected" : ""}`} onClick={() => setProgram(item.code)} aria-pressed={program === item.code}><div className="renewal-card-top-row"><span className="renewal-program-icon-badge icon-jlpt" aria-hidden="true"><LuAward /></span>{program === item.code && <span className="renewal-card-check"><LuCircleCheck aria-hidden="true" /></span>}</div><div className="renewal-card-body"><strong className="renewal-program-title">{item.name}</strong></div></button>)}</div></section>
      <section className="renewal-step-section"><div className="renewal-step-header"><h2>Pilih Paket Belajar</h2><p>Pilih metode pembelajaran yang sesuai dengan ritme dan kebutuhan bimbinganmu.</p></div><div className="renewal-plans-grid">{(["lms", "sensei"] as const).map(value => <button className={`renewal-plan-card ${plan === value ? "selected" : ""}`} type="button" onClick={() => setPlan(value)} aria-pressed={plan === value} key={value}><div className="renewal-plan-header"><div className="renewal-plan-icon-wrap" aria-hidden="true">{value === "lms" ? <LuBookOpen /> : <LuGraduationCap />}</div><div className="renewal-plan-titles"><h3>{planLabel(value)}</h3></div></div>{plan === value && order.offer && <div className="renewal-plan-price-box"><span className="renewal-price-val">{order.offer.effective_price === null ? "—" : money(order.offer.effective_price)}</span><span className="renewal-price-period">/ {order.offer.duration_months} Bulan</span></div>}</button>)}</div></section>
      <section className="checkout-referral"><label>Kode Referral<input value={referral} onChange={event => setReferral(event.target.value)} placeholder="Masukkan kode jika ada" /></label></section>
      <section className="renewal-summary-card"><div className="renewal-summary-head"><div className="renewal-summary-tag"><LuReceipt aria-hidden="true" /><span>RINGKASAN RENEWAL</span></div><h2>{label} • {planLabel(plan)}</h2></div><div className="renewal-summary-grid"><div className="summary-item"><span className="label">Biaya Investasi</span><strong className="value text-orange">{order.offer?.effective_price == null ? "—" : money(order.offer.effective_price)}</strong></div></div>{order.error && <p role="alert">{order.error}</p>}{!order.offer && <p role="status">Program belum tersedia.</p>}<div className="renewal-invoice-action"><button className="renewal-submit-button" type="button" disabled={order.busy || !order.offer} onClick={() => void create()}><LuReceipt aria-hidden="true" /><span>Buat Invoice</span></button></div></section>
    </>}
    <aside className="renewal-announcement-box"><strong>Pengumuman</strong><p>Membership aktif setelah invoice diverifikasi Admin. OPEN: konfigurasi WhatsApp dan aturan perpanjangan akses.</p></aside>
  </>;
}

function RenewalInvoice({ id }: { id: string }) {
  const request = useCommercialInvoice(id);
  const [refreshError, setRefreshError] = useState("");
  const invoice = request.invoice;
  async function refresh() {
    setRefreshError("");
    try { await request.refresh(); }
    catch (cause) { setRefreshError(cause instanceof Error ? cause.message : "Permintaan belum berhasil."); }
  }
  const labels: Record<string, string> = { draft: "Draft", awaiting_payment: "Menunggu Pembayaran", paid: "Sudah Bayar", verified: "Diverifikasi", active: "Aktif", cancelled: "Dibatalkan" };
  return <section className="renewal-summary-card"><header className="renewal-summary-head"><h2>Invoice</h2></header>{(request.error || refreshError) && <p role="alert">{refreshError || request.error}</p>}{!invoice && !request.error && <p role="status">Memuat…</p>}{invoice && <><dl><div><dt>Invoice ID</dt><dd>{invoice.id}</dd></div><div><dt>Program</dt><dd>{commercialCode(invoice.program_code)}</dd></div><div><dt>Paket Belajar</dt><dd>{planLabel(invoice.plan_code)}</dd></div><div><dt>Harga</dt><dd>{money(invoice.base_price)}</dd></div><div><dt>Diskon</dt><dd>{money(invoice.discount_amount)}</dd></div><div><dt>Total</dt><dd>{money(invoice.total_price)}</dd></div><div><dt>Status</dt><dd>{labels[invoice.status] ?? invoice.status}</dd></div>{invoice.access_grant && <div><dt>Akses aktif</dt><dd>{new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta" }).format(new Date(invoice.access_grant.ends_at))}</dd></div>}</dl><div className="button-group">{invoice.status === "draft" && <button className="button button-primary" type="button" disabled={request.busy} onClick={() => void request.submit()}>Buat Invoice</button>}{invoice.status === "awaiting_payment" && <button className="button button-primary" type="button" disabled={request.busy} onClick={() => void request.markPaid()}>Sudah Bayar</button>}<button className="button button-secondary" type="button" disabled={request.busy} onClick={() => void refresh()}>Perbarui Status</button></div></>}</section>;
}

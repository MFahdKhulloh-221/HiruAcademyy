"use client";

import Link from "next/link";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useState } from "react";
import { ProfileScreen } from "@/components/profile-screen";
import { StudentHeaderActions } from "@/components/student-header-actions";
import { LuArrowLeft, LuAward, LuBookOpen, LuCircleCheck, LuGraduationCap, LuReceipt, LuShieldCheck } from "react-icons/lu";
import { StudentAffiliateScreen } from "@/components/student-affiliate-screen";
import { StudentBreadcrumb } from "@/components/student-breadcrumb";
import { StudentNavigation } from "@/components/student-navigation";
import { StudentNotificationsScreen } from "@/components/student-notifications-screen";
import { StudentCommunityScreen } from "@/components/student-community-screen";
import { StudentProgressScreen } from "@/components/student-progress-screen";
import { StudentLeaderboardScreen } from "@/components/student-leaderboard-screen";
import { StudentCertificateCenter } from "@/components/certificate-detail-screen";
import { LearningLibrary } from "@/components/learning-library";
import { PracticeScreen } from "@/components/practice-screen";
import { useCommercialInvoice, useCommercialOrder } from "@/components/commercial-hooks";
import { commercialCode } from "@/lib/commercial-api";
import { invoiceWhatsAppUrl } from "@/lib/admin-whatsapp";
import { useAuth } from "@/components/auth-provider";
import type { LearningAccess, LearningProgram } from "@/lib/learning-api";
import { supportingData, type SupportingKind } from "@/lib/supporting-mock";

type Membership = "free" | "lms" | "sensei";
type Props = { kind: SupportingKind; membership: Membership; access: LearningAccess; programs: LearningProgram[]; breadcrumbCurrent?: string; targetProgram?: string; invoiceId?: string };
const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const planLabel = (plan: Membership) => plan === "sensei" ? "Kelas bersama Sensei" : plan === "lms" ? "Belajar Mandiri" : "Free Member";

export function SupportingScreen(props: Props) {
  const { kind, membership } = props;
  if (kind === "library") return <LearningLibrary />;
  if (kind === "practice") return <PracticeScreen membership={membership} resolvedCatalog={props} />;
  return <div className="supporting-shell student-shell"><StudentNavigation membership={membership} /><main className={`supporting-main ${kind === "renewal" ? "renewal" : kind}-page`}>
    <StudentHeaderActions membership={membership} />
    {kind === "notifications" ? <StudentNotificationsScreen /> : kind === "community" ? <StudentCommunityScreen membership={membership} /> : kind === "progress" ? <StudentProgressScreen /> : kind === "leaderboard" ? <StudentLeaderboardScreen /> : kind === "certificate" ? <StudentCertificateCenter /> : kind === "profile" ? <ProfileScreen access={props.access} programs={props.programs} /> : kind === "affiliate" ? <StudentAffiliateScreen /> : kind === "renewal" ? <RenewalScreen {...props} /> : <EmptySupportingScreen kind={kind} />}
  </main></div>;
}

function EmptySupportingScreen({ kind }: { kind: SupportingKind }) {
  const data = kind === "practice" ? { eyebrow: "LATIHAN", title: "Latihan", description: "" } : supportingData[kind];
  return <>{kind === "createPost" && <StudentBreadcrumb items={[{ label: "Diskusi Member", href: "/community" }, { label: "Buat Diskusi" }]} />}<header className="supporting-header"><p className="dash-kicker">{data.eyebrow}</p><h1>{data.title}</h1><p>{data.description}</p></header><section className="library-empty"><p role="status">OPEN: layanan ini belum tersedia. Belum ada data untuk ditampilkan.</p>{kind === "progress" && <Link className="button button-secondary" href="/journey">Perjalanan Level</Link>}</section></>;
}


function RenewalScreen({ membership, access, programs, targetProgram, breadcrumbCurrent, invoiceId }: Props) {
  const isFree = membership === "free";
  const ownedPrograms = programs.filter(item => access.source_grants.some(grant => grant.program_code === item.code));
  const recommendedPrograms = [...ownedPrograms, ...programs.filter(item => !ownedPrograms.includes(item))];

  const requested = commercialCode(targetProgram ?? "");
  const initialProgram = programs.find(item => commercialCode(item.code) === requested)?.code
    ?? recommendedPrograms[0]?.code
    ?? programs[0]?.code
    ?? "";

  const [program, setProgram] = useState(initialProgram);
  const [plan, setPlan] = useState<"lms" | "sensei">("lms");
  const [referral, setReferral] = useState("");
  const [createdId, setCreatedId] = useState<string>();
  const order = useCommercialOrder(commercialCode(program), plan);
  const selectedInvoice = createdId ?? invoiceId;
  const label = programs.find(item => item.code === program)?.name ?? "—";

  const lmsOffer = order.offers?.find(row => row.program.code === program && row.plan_code === "lms");
  const senseiOffer = order.offers?.find(row => row.program.code === program && row.plan_code === "sensei");

  async function create() {
    const invoice = await order.create(referral);
    if (invoice) {
      setCreatedId(String(invoice.id));
      const url = new URL(window.location.href);
      url.searchParams.set("invoice", String(invoice.id));
      window.history.replaceState(null, "", url);
    }
  }

  const learningCodes = Object.entries(access.learning).filter(([, state]) => state === (isFree ? "preview" : "full")).map(([code]) => code);
  const replayCodes = [...new Set(access.replay_levels)];
  const liveCodes = [...new Set(access.source_grants.filter(grant => grant.plan_code === "sensei").map(grant => grant.program_code))];
  const programName = (code: string) => programs.find(item => item.code === code)?.name ?? commercialCode(code);
  const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

  return <>
    <div className="renewal-top-nav">
      <Link className="renewal-top-back" href="/profile"><LuArrowLeft aria-hidden="true" /><span>Kembali ke Profil</span></Link>
      {breadcrumbCurrent && <StudentBreadcrumb items={[{ label: "Membership", href: "/renewal" }, { label: breadcrumbCurrent }]} />}
    </div>

    <header className="supporting-header renewal-header">
      <p className="dash-kicker">MEMBERSHIP</p>
      <h1>Lanjutkan Akses Tanpa Kehilangan Progres</h1>
      <p>Kelola akses dan perpanjang membership tanpa kehilangan progres.</p>
    </header>

    <section className="renewal-membership" aria-labelledby="renewal-membership-title">
      <h2 id="renewal-membership-title">Membership &amp; Akses Belajar</h2>
      <div className="renewal-membership-overview">
        <div className="renewal-membership-icon" aria-hidden="true"><LuShieldCheck /></div>
        <div>
          <div className="renewal-membership-package">
            <h3>{planLabel(membership)}</h3>
            <span className={`renewal-membership-status${isFree ? " is-free" : ""}`}>{isFree ? "Preview" : "Aktif"}</span>
          </div>
          <p>{isFree ? "Coba gratis / preview Chapter 1." : membership === "sensei" ? "Pembelajaran mandiri, replay, dan tatap muka sesuai level." : "Belajar mandiri sesuai akses membership."}</p>
        </div>
        <p className="renewal-membership-count"><strong>{new Set(access.source_grants.map(grant => grant.program_code)).size}</strong> program dimiliki</p>
      </div>

      <div className="renewal-access-facilities">
        <div><LuBookOpen aria-hidden="true" /><h3>Pembelajaran</h3><strong>{learningCodes.length} program{isFree ? " preview" : ""}</strong><p>{learningCodes.slice(0, 3).map(programName).join(", ") || "Belum tersedia"}{learningCodes.length > 3 ? `, +${learningCodes.length - 3} lainnya` : ""}</p></div>
        <div><LuReceipt aria-hidden="true" /><h3>Replay</h3><strong>{replayCodes.length} level</strong><p>{replayCodes.slice(0, 3).map(programName).join(", ") || "Belum tersedia"}{replayCodes.length > 3 ? `, +${replayCodes.length - 3} lainnya` : ""}</p></div>
        <div><LuGraduationCap aria-hidden="true" /><h3>Live Zoom Sensei</h3><strong>{liveCodes.length ? "Tatap muka sesuai level" : "Belum tersedia"}</strong><p>{liveCodes.map(programName).join(", ") || "Tidak ada akses Live Zoom Sensei."}</p></div>
      </div>
      <details className="renewal-access-details">
        <summary>Lihat rincian akses</summary>
        <div className="renewal-access-detail-grid">
          {([["Pembelajaran", learningCodes], ["Replay", replayCodes]] as const).map(([title, codes]) => <div key={title}>
            <h3>{title}{title === "Pembelajaran" && isFree ? " · Preview Chapter 1" : ""}</h3>
            {codes.length ? <ul className="renewal-access-chips">{codes.map(code => <li key={code}>{programName(code)}</li>)}</ul> : <p>Belum tersedia</p>}
          </div>)}
        </div>
      </details>

      <div className="renewal-membership-programs">
        <h3>Program &amp; masa aktif</h3>
        {access.source_grants.length ? <ul className="renewal-membership-rows">{access.source_grants.map((grant, index) => <li key={index}>
          <h4>{programName(grant.program_code)}</h4>
          <dl>
            <div><dt>Paket</dt><dd>{planLabel(grant.plan_code === "sensei" ? "sensei" : "lms")}</dd></div>
            <div className="renewal-membership-period"><dt>Masa aktif</dt><dd>{grant.starts_at && grant.ends_at ? `${Math.max(0, Math.ceil((new Date(grant.ends_at).getTime() - new Date(grant.starts_at).getTime()) / 86_400_000))} hari` : "Belum tersedia"}</dd></div>
            {([["Mulai", grant.starts_at], ["Berakhir", grant.ends_at]] as const).map(([title, date]) => <div key={title}>
              <dt>{title}</dt>
              <dd>{date ? <time dateTime={date}>{dateFormat.format(new Date(date))}</time> : "Belum tersedia"}</dd>
            </div>)}
          </dl>
        </li>)}</ul> : <p role="status">Belum ada membership aktif. Pilih program dan paket untuk melanjutkan belajar.</p>}
      </div>
    </section>
    <aside className="renewal-membership-note" aria-label="Ketentuan perpanjangan membership">
      <LuCircleCheck aria-hidden="true" />
      <p>Perpanjangan JLPT berlaku untuk program dan paket yang sama. Membership aktif diperpanjang dari tanggal berakhir; membership kedaluwarsa dimulai saat pembayaran terverifikasi. Program atau paket berbeda dihitung sebagai pembelian baru.</p>
    </aside>

    {selectedInvoice ? <RenewalInvoice key={selectedInvoice} id={selectedInvoice} /> : <>
      {(
        <section className="renewal-step-section">
          <div className="renewal-step-header">
            <h2>Pilih Program / Level</h2>
            <p>Membership milik siswa ditampilkan lebih dahulu; program lain merupakan pembelian baru.</p>
          </div>
          <div className="renewal-program-grid">
            {(recommendedPrograms.length > 0 ? recommendedPrograms : programs).map(item => (
              <button
                key={item.id}
                type="button"
                className={`renewal-program-card ${program === item.code ? "selected" : ""}`}
                onClick={() => setProgram(item.code)}
                aria-pressed={program === item.code}
              >
                <div className="renewal-card-top-row">
                  <span className="renewal-program-icon-badge icon-jlpt" aria-hidden="true"><LuAward /></span>
                  {program === item.code && <span className="renewal-card-check"><LuCircleCheck aria-hidden="true" /></span>}
                </div>
                <div className="renewal-card-body">
                  <strong className="renewal-program-title">{item.name}</strong>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="renewal-step-section">
        <div className="renewal-step-header">
          <h2>Pilih Paket Belajar</h2>
          <p>Pilih metode pembelajaran yang sesuai dengan ritme belajarmu.</p>
        </div>
        <div className="renewal-plans-grid">
          <button
            className={`renewal-plan-card ${plan === "lms" ? "selected" : ""}`}
            type="button"
            onClick={() => setPlan("lms")}
            aria-pressed={plan === "lms"}
          >
            <div className="renewal-plan-header">
              <div className="renewal-plan-icon-wrap" aria-hidden="true"><LuBookOpen /></div>
              <div className="renewal-plan-titles">
                <span className="renewal-plan-badge">LMS</span>
                <h3>Belajar Mandiri</h3>
              </div>
              {plan === "lms" && <span className="renewal-plan-check" aria-hidden="true"><LuCircleCheck /></span>}
            </div>
            <p className="renewal-plan-desc">Journey penuh, try out, review, sertifikat, dan forum diskusi.</p>
            <div className="renewal-plan-price-box">
              <span className="renewal-price-val">
                {lmsOffer?.base_price != null ? money(lmsOffer.effective_price ?? lmsOffer.base_price) : "Tidak Tersedia"}
              </span>
              {lmsOffer && <span className="renewal-price-period">/ {lmsOffer.duration_months} Bulan</span>}
            </div>
          </button>

          {!["ssw-food", "interview"].includes(program) && (
            <button
              className={`renewal-plan-card ${plan === "sensei" ? "selected" : ""}`}
              type="button"
              onClick={() => setPlan("sensei")}
              aria-pressed={plan === "sensei"}
            >
              <div className="renewal-plan-header">
                <div className="renewal-plan-icon-wrap" aria-hidden="true"><LuGraduationCap /></div>
                <div className="renewal-plan-titles">
                  <span className="renewal-plan-badge" style={{ background: "var(--orange)", color: "#5a2a00" }}>SENSEI</span>
                  <h3>Kelas bersama Sensei</h3>
                </div>
                {plan === "sensei" && <span className="renewal-plan-check" aria-hidden="true"><LuCircleCheck /></span>}
              </div>
              <p className="renewal-plan-desc">Semua LMS ditambah cohort, jadwal Zoom, bimbingan Sensei, dan replay.</p>
              <div className="renewal-plan-price-box">
                <span className="renewal-price-val">
                  {senseiOffer?.base_price != null ? money(senseiOffer.effective_price ?? senseiOffer.base_price) : "Tidak Tersedia"}
                </span>
                {senseiOffer && <span className="renewal-price-period">/ {senseiOffer.duration_months} Bulan</span>}
              </div>
            </button>
          )}
        </div>
      </section>

      <section className="renewal-summary-card">
        <div className="renewal-summary-head">
          <div className="renewal-summary-tag"><LuReceipt aria-hidden="true" /><span>RINGKASAN RENEWAL</span></div>
          <h2>{label} • {planLabel(plan)}</h2>
        </div>
        <div className="renewal-summary-grid">
          <div className="summary-item">
            <span className="label">Biaya Investasi</span>
            <strong className="value text-orange">
              {!order.offer ? "Tidak Tersedia" : money(order.offer.effective_price ?? order.offer.base_price ?? 0)}
            </strong>
          </div>
        </div>
        {order.loading && <p role="status">Memuat harga…</p>}
        {order.error && <><p role="alert">{order.error}</p><button type="button" className="button button-secondary" onClick={order.reload}>Coba Lagi</button></>}
        {(!order.loading && !order.offer) && <p role="status">Program belum tersedia untuk pembelian.</p>}
        <div className="checkout-referral renewal-referral">
          <label htmlFor="renewal-referral">Kode Referral <span>(opsional)</span></label>
          <input
            id="renewal-referral"
            value={referral}
            onChange={event => setReferral(event.target.value)}
            placeholder="Masukkan kode referral jika ada"
          />
        </div>
        <div className="renewal-invoice-action">
          <button
            className="renewal-submit-button"
            type="button"
            disabled={order.loading || order.busy || !order.offer}
            onClick={() => void create()}
          >
            <LuReceipt aria-hidden="true" />
            <span>Buat Invoice</span>
          </button>
        </div>
      </section>

    </>}

    <aside className="renewal-announcement-box">
      <strong>Pengumuman</strong>
      <p>Membership aktif setelah invoice pembayaran diverifikasi Admin.</p>
    </aside>
  </>;
}

function RenewalInvoice({ id }: { id: string }) {
  const { user } = useAuth();
  const request = useCommercialInvoice(id);
  const [refreshError, setRefreshError] = useState("");
  const invoice = request.invoice;
  async function refresh() {
    setRefreshError("");
    try { await request.refresh(); }
    catch (cause) { setRefreshError(cause instanceof Error ? cause.message : "Permintaan belum berhasil."); }
  }
  const labels: Record<string, string> = { draft: "Draft", awaiting_payment: "Menunggu Pembayaran", paid: "Menunggu Konfirmasi Admin", verified: "Menunggu Aktivasi", active: "Sudah Bayar", cancelled: "Dibatalkan" };
  return <section className="renewal-summary-card"><header className="renewal-summary-head"><h2>Invoice</h2></header>{(request.error || refreshError) && <p role="alert">{refreshError || request.error}</p>}{!invoice && !request.error && <LoadingSkeleton variant="form" label="Memuat…" />}{invoice && <><dl><div><dt>Invoice ID</dt><dd>{invoice.id}</dd></div><div><dt>Program</dt><dd>{commercialCode(invoice.program_code)}</dd></div><div><dt>Jenis Transaksi</dt><dd>{invoice.renewal_grant_id ? "Perpanjangan Membership" : "Pembelian Baru"}</dd></div><div><dt>Paket Belajar</dt><dd>{planLabel(invoice.plan_code)}</dd></div><div><dt>Harga</dt><dd>{money(invoice.base_price)}</dd></div><div><dt>Diskon</dt><dd>{money(invoice.discount_amount)}</dd></div><div><dt>Total</dt><dd>{money(invoice.total_price)}</dd></div><div><dt>Status</dt><dd>{labels[invoice.status] ?? invoice.status}</dd></div>{invoice.access_grant && <div><dt>Akses aktif</dt><dd>{new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta" }).format(new Date(invoice.access_grant.ends_at))}</dd></div>}</dl><div className="button-group">{invoice.status === "draft" && <button className="button button-primary" type="button" disabled={request.busy} onClick={() => void request.submit()}>Buat Invoice</button>}<a className="button button-primary" href={invoiceWhatsAppUrl(invoice, user?.email)} target="_blank" rel="noopener noreferrer">Hubungi Admin via WhatsApp</a><button className="button button-secondary" type="button" disabled={request.busy} onClick={() => void refresh()}>Perbarui Status</button></div></>}</section>;
}

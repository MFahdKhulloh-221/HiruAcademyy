"use client";

import Link from "next/link";
import { useState } from "react";
import { LuArrowLeft, LuAward, LuBookOpen, LuCircleCheck, LuGraduationCap, LuReceipt, LuShieldCheck } from "react-icons/lu";
import { useAuth } from "@/components/auth-provider";
import { StudentBreadcrumb } from "@/components/student-breadcrumb";
import { StudentNavigation } from "@/components/student-navigation";
import { StudentNotificationsScreen } from "@/components/student-notifications-screen";
import { StudentCommunityScreen } from "@/components/student-community-screen";
import { StudentProgressScreen } from "@/components/student-progress-screen";
import { StudentCertificateCenter } from "@/components/certificate-detail-screen";
import { LearningLibrary } from "@/components/learning-library";
import { PracticeScreen } from "@/components/practice-screen";
import { useCommercialAffiliate, useCommercialInvoice, useCommercialOrder } from "@/components/commercial-hooks";
import { apiRequest } from "@/lib/api";
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
    {kind === "notifications" ? <StudentNotificationsScreen /> : kind === "community" ? <StudentCommunityScreen membership={membership} /> : kind === "progress" ? <StudentProgressScreen membership={membership} /> : kind === "certificate" ? <StudentCertificateCenter /> : kind === "profile" ? <ProfileScreen membership={membership} access={props.access} /> : kind === "affiliate" ? <AffiliateScreen /> : kind === "renewal" ? <RenewalScreen {...props} /> : <EmptySupportingScreen kind={kind} />}
  </main></div>;
}

function EmptySupportingScreen({ kind }: { kind: SupportingKind }) {
  const data = kind === "practice" ? { eyebrow: "LATIHAN", title: "Latihan", description: "" } : supportingData[kind];
  return <>{kind === "createPost" && <StudentBreadcrumb items={[{ label: "Diskusi Member", href: "/community" }, { label: "Buat Diskusi" }]} />}<header className="supporting-header"><p className="dash-kicker">{data.eyebrow}</p><h1>{data.title}</h1><p>{data.description}</p></header><section className="library-empty"><p role="status">OPEN: layanan ini belum tersedia. Belum ada data untuk ditampilkan.</p>{kind === "progress" && <Link className="button button-secondary" href="/journey">Perjalanan Level</Link>}</section></>;
}

function ProfileScreen({ membership, access }: { membership: Membership; access: LearningAccess }) {
  const { user, refreshUser } = useAuth();
  const initials = (user?.name ?? "").trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] ?? "").join("").toUpperCase();

  const [name, setName] = useState(user?.name ?? "");
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp ?? "");
  const [country, setCountry] = useState(user?.country ?? "");
  const [targetJlpt, setTargetJlpt] = useState(user?.target_jlpt ?? "N5");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState("");

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileBusy(true);
    setProfileError("");
    setProfileSuccess(false);
    try {
      await apiRequest("/api/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          email: user?.email,
          whatsapp: whatsapp.trim(),
          country: country.trim() || null,
          target_jlpt: targetJlpt,
        }),
      });
      await refreshUser();
      setProfileSuccess(true);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Gagal memperbarui profil.");
    } finally {
      setProfileBusy(false);
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwError("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    setPwBusy(true);
    setPwError("");
    setPwSuccess(false);
    try {
      await apiRequest("/api/me/password", {
        method: "PUT",
        body: JSON.stringify({
          current_password: currentPassword,
          password: newPassword,
          password_confirmation: confirmPassword,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwSuccess(true);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Gagal memperbarui kata sandi.");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <>
      <header className="supporting-header">
        <p className="dash-kicker">AKUN &amp; MEMBERSHIP</p>
        <h1>Profil dan status belajarmu</h1>
        <p>Kelola informasi akun, status belajar, sertifikat, dan preferensi.</p>
      </header>

      <section className="profile-identity">
        <span>{initials}</span>
        <div>
          <h2>{user?.name ?? ""}</h2>
          <p>{user?.email ?? ""}</p>
          <div className="profile-identity-tags">
            {access.source_grants.map((grant, index) => (
              <span className="profile-pill" key={`${grant.program_code}/${grant.plan_code}/${index}`}>
                {commercialCode(grant.program_code)} • {planLabel(grant.plan_code === "sensei" ? "sensei" : "lms")}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="profile-membership">
        <div>
          <p className="dash-kicker">STATUS MEMBERSHIP</p>
          <h2>{planLabel(membership)}</h2>
        </div>
        <Link className="button button-primary" href="/renewal">Perpanjang Membership</Link>
      </section>

      <section className="profile-certificates">
        <div className="profile-section-header"><h2>Sertifikat</h2></div>
        <div className="profile-cert-footer">
          <Link className="button button-secondary profile-all-cert-btn" href="/certificate">Lihat Semua Sertifikat →</Link>
        </div>
      </section>

      <section className="profile-referral">
        <div className="profile-section-header">
          <div><p className="dash-kicker">PROGRAM AFFILIATE</p><h2>Kode referral saya</h2></div>
          <Link className="button button-secondary" href="/affiliate">Buka Halaman Affiliate →</Link>
        </div>
      </section>

      <section className="profile-settings" id="pengaturan" style={{ background: "#fff", padding: "28px", borderRadius: "20px", border: "1px solid var(--line)", marginTop: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "20px" }}>Pengaturan Akun</h2>

        <form onSubmit={handleUpdateProfile} style={{ display: "grid", gap: "16px", maxWidth: "560px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>Informasi Pribadi</h3>

          {profileSuccess && <p role="status" style={{ color: "#2d7a38", fontWeight: 700, margin: 0 }}>Profil berhasil diperbarui!</p>}
          {profileError && <p role="alert" style={{ color: "#c65b4b", margin: 0 }}>{profileError}</p>}

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>Nama Lengkap</span>
            <input required value={name} onChange={e => setName(e.target.value)} style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--line)" }} />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>Nomor WhatsApp</span>
            <input required value={whatsapp} onChange={e => setWhatsapp(e.target.value)} style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--line)" }} />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>Negara</span>
            <input value={country} onChange={e => setCountry(e.target.value)} placeholder="Contoh: Indonesia, Jepang" style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--line)" }} />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>Target JLPT</span>
            <select value={targetJlpt} onChange={e => setTargetJlpt(e.target.value)} style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--line)", background: "#fff" }}>
              <option value="N5">JLPT N5</option>
              <option value="N4">JLPT N4</option>
              <option value="N3">JLPT N3</option>
              <option value="N2">JLPT N2</option>
              <option value="N1">JLPT N1</option>
            </select>
          </label>

          <div>
            <button type="submit" disabled={profileBusy} className="button button-primary">
              {profileBusy ? "Menyimpan…" : "Simpan Perubahan"}
            </button>
          </div>
        </form>

        <hr style={{ margin: "32px 0", borderColor: "var(--line)", borderStyle: "solid" }} />

        <form onSubmit={handleUpdatePassword} style={{ display: "grid", gap: "16px", maxWidth: "560px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>Ganti Kata Sandi</h3>

          {pwSuccess && <p role="status" style={{ color: "#2d7a38", fontWeight: 700, margin: 0 }}>Kata sandi berhasil diperbarui!</p>}
          {pwError && <p role="alert" style={{ color: "#c65b4b", margin: 0 }}>{pwError}</p>}

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>Kata Sandi Saat Ini</span>
            <input required type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--line)" }} />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>Kata Sandi Baru (min. 8 karakter)</span>
            <input required type="password" minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--line)" }} />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>Konfirmasi Kata Sandi Baru</span>
            <input required type="password" minLength={8} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--line)" }} />
          </label>

          <div>
            <button type="submit" disabled={pwBusy || !currentPassword || !newPassword} className="button button-primary">
              {pwBusy ? "Memproses…" : "Perbarui Kata Sandi"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

function AffiliateScreen() {
  const { data, error } = useCommercialAffiliate();
  return <><header className="supporting-header"><p className="dash-kicker">PROGRAM AFILIASI &amp; REFERRAL</p><h1>Program Affiliate Hiru Academy</h1><p>Bagikan kode atau link affiliate. Teman mendapat diskon pendaftaran, dan kamu memperoleh komisi.</p></header>
    {error && <p role="alert">{error}</p>}{!data && !error && <p role="status">Memuat…</p>}
    {data && <><section className="affiliate-share-card"><div className="affiliate-code-box"><label>Kode Referral Unik</label><div className="affiliate-input-row"><code>{data.code ?? "—"}</code></div></div></section><section className="profile-stats">{([ ["pending", "Komisi Belum Dicairkan"], ["approved", "Komisi valid"], ["paid", "Komisi Sudah Dicairkan"] ] as const).map(([key, label]) => <div key={key}><strong>{money(data.totals[key])}</strong><span>{label}</span></div>)}</section>{!data.affiliate && <section className="library-empty"><p>Belum ada data affiliate.</p></section>}</>}
  </>;
}

function RenewalScreen({ membership, access, programs, targetProgram, breadcrumbCurrent, invoiceId }: Props) {
  const isFree = membership === "free";
  const jlptRank: Record<string, number> = { n5: 5, n4: 4, n3: 3, n2: 2, n1: 1 };
  let highestOwnedJlpt: string | null = null;
  for (const [code, status] of Object.entries(access.learning)) {
    if (status === "full" && jlptRank[code]) {
      if (!highestOwnedJlpt || jlptRank[code] < jlptRank[highestOwnedJlpt]) {
        highestOwnedJlpt = code;
      }
    }
  }

  let nextJlptRec: string | null = null;
  if (isFree) nextJlptRec = "n5";
  else if (highestOwnedJlpt === "n5") nextJlptRec = "n4";
  else if (highestOwnedJlpt === "n4") nextJlptRec = "n3";
  else if (highestOwnedJlpt === "n3") nextJlptRec = "n2";
  else nextJlptRec = null;

  const ownsSsw = access.learning["ssw-food"] === "full";
  const ownsInterview = access.learning["interview"] === "full";

  const recommendedPrograms = programs.filter(item => {
    if (item.code === "n1") return false;
    if (item.code === nextJlptRec) return true;
    if (item.code === "ssw-food" && !ownsSsw) return true;
    if (item.code === "interview" && !ownsInterview) return true;
    return false;
  });

  const allOwned = highestOwnedJlpt === "n1" && ownsSsw && ownsInterview;

  const requested = targetProgram?.toUpperCase();
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

  const liveSenseiGrants = access.source_grants.filter(g => g.plan_code === "sensei");

  return <>
    <div className="renewal-top-nav">
      <Link className="renewal-top-back" href="/profile"><LuArrowLeft aria-hidden="true" /><span>Kembali ke Profil</span></Link>
      {breadcrumbCurrent && <StudentBreadcrumb items={[{ label: "Membership", href: "/renewal" }, { label: breadcrumbCurrent }]} />}
    </div>

    <header className="supporting-header renewal-header">
      <p className="dash-kicker">MEMBERSHIP RENEWAL</p>
      <h1>Lanjutkan Akses Tanpa Kehilangan Progres</h1>
      <p>Harga resmi dan periode belajar aktif terhubung langsung dengan sistem HIRU Academy.</p>
    </header>

    <section className="renewal-current-banner">
      <div className="banner-left">
        <div className="banner-shield-icon" aria-hidden="true"><LuShieldCheck /></div>
        <div className="banner-copy">
          <div className="banner-status-pill">
            <LuCircleCheck aria-hidden="true" />
            <span>Membership Aktif</span>
          </div>
          <h2>
            {planLabel(membership)}
            {highestOwnedJlpt ? ` • JLPT ${highestOwnedJlpt.toUpperCase()}` : isFree ? " • Coba Gratis / Preview" : ""}
          </h2>
          <div style={{ marginTop: "10px", fontSize: "13px", lineHeight: 1.6, color: "var(--muted)" }}>
            {isFree ? (
              <p>Akses: Coba Gratis / Preview Chapter 1 seluruh level (Dasar s/d N1, SSW, Interview).</p>
            ) : membership === "lms" ? (
              <p>
                <strong>Akses Belajar Mandiri:</strong>{" "}
                {Object.entries(access.learning).filter(([, st]) => st === "full").map(([c]) => commercialCode(c)).join(", ")}
              </p>
            ) : (
              <>
                <p>
                  <strong>Akses Pembelajaran:</strong>{" "}
                  {Object.entries(access.learning).filter(([, st]) => st === "full").map(([c]) => commercialCode(c)).join(", ")}
                </p>
                <p>
                  <strong>Akses Replay:</strong>{" "}
                  {access.replay_levels.map(l => l.toUpperCase()).join(", ")}
                </p>
                <p>
                  <strong>Live Zoom Sensei:</strong>{" "}
                  {liveSenseiGrants.map(g => commercialCode(g.program_code)).join(", ")} (Tatap Muka Sesuai Level)
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>

    {selectedInvoice ? <RenewalInvoice key={selectedInvoice} id={selectedInvoice} /> : <>
      {!allOwned && (
        <section className="renewal-step-section">
          <div className="renewal-step-header">
            <h2>Pilih Program / Level</h2>
            <p>Rekomendasi level lanjutan yang dapat kamu pelajari.</p>
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
                {program === "n1" ? "Tidak Tersedia" : lmsOffer?.effective_price ? money(lmsOffer.effective_price) : "Rp 99.000"}
              </span>
              {program !== "n1" && <span className="renewal-price-period">/ {lmsOffer?.duration_months ?? 6} Bulan</span>}
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
                  {program === "n1" ? "Tidak Tersedia" : senseiOffer?.effective_price ? money(senseiOffer.effective_price) : "Rp 350.000"}
                </span>
                {program !== "n1" && <span className="renewal-price-period">/ {senseiOffer?.duration_months ?? 1} Bulan</span>}
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
              {program === "n1" || !order.offer ? "Tidak Tersedia" : money(order.offer.effective_price ?? order.offer.base_price ?? 0)}
            </strong>
          </div>
        </div>
        {order.error && <p role="alert">{order.error}</p>}
        {(!order.offer || program === "n1") && <p role="status">Program belum tersedia untuk pembelian.</p>}
        <div className="renewal-invoice-action">
          <button
            className="renewal-submit-button"
            type="button"
            disabled={order.busy || !order.offer || program === "n1"}
            onClick={() => void create()}
          >
            <LuReceipt aria-hidden="true" />
            <span>Buat Invoice</span>
          </button>
        </div>
      </section>

      <section className="checkout-referral" style={{ marginTop: "16px" }}>
        <label>
          Kode Referral
          <input
            value={referral}
            onChange={event => setReferral(event.target.value)}
            placeholder="Masukkan kode referral jika ada"
          />
        </label>
      </section>
    </>}

    <aside className="renewal-announcement-box">
      <strong>Pengumuman</strong>
      <p>Membership aktif setelah invoice pembayaran diverifikasi Admin.</p>
    </aside>
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

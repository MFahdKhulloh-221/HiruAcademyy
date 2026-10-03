import { useAuth } from "@/components/auth-provider";
import { StudentBreadcrumb } from "@/components/student-breadcrumb";
import { PracticeScreen as PracticeFlowScreen } from "@/components/practice-screen";
import { StudentNavigation } from "@/components/student-navigation";
import { supportingData, type SupportingKind } from "@/lib/supporting-mock";
import { createPublicInvoice, getCurrentDemoUser, getInvoiceWhatsAppUrl } from "@/lib/business-store";
import { hasFullLearningAccess, jlptLevels } from "@/lib/journey-mock";
import { usePublishedCurriculum } from "@/lib/curriculum-store";
import { usePublishedAnnouncements } from "@/lib/website-store";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import {
  LuArrowLeft,
  LuAward,
  LuBell,
  LuBookOpen,
  LuBriefcase,
  LuCalendar,
  LuCheck,
  LuChefHat,
  LuCircleCheck,
  LuClipboardCheck,
  LuClock,
  LuCopy,
  LuFlame,
  LuFlag,
  LuGift,
  LuGraduationCap,
  LuInfo,
  LuKey,
  LuLayers3,
  LuLock,
  LuMail,
  LuMessagesSquare,
  LuReceipt,
  LuRotateCcw,
  LuRoute,
  LuSearch,
  LuShare2,
  LuShieldCheck,
  LuTag,
  LuUser,
} from "react-icons/lu";

export function SupportingScreen({ kind, membership, breadcrumbCurrent, targetProgram }: { kind: SupportingKind; membership: "free" | "lms" | "sensei"; breadcrumbCurrent?: string; targetProgram?: string }) {
  if (kind === "practice") return <PracticeFlowScreen membership={membership} />;
  const data = supportingData[kind];
  if (kind === "library") return <LibraryScreen membership={membership} />;
  if (kind === "progress") return <ProgressScreen membership={membership} />;
  if (kind === "leaderboard") return <LeaderboardScreen membership={membership} />;
  if (kind === "certificate") return <CertificateScreen membership={membership} />;
  if (kind === "community") return <CommunityScreen membership={membership} />;
  if (kind === "notifications") return <NotificationScreen membership={membership} />;
  if (kind === "profile") return <ProfileScreen membership={membership} />;
  if (kind === "renewal") return <RenewalScreen membership={membership} breadcrumbCurrent={breadcrumbCurrent} targetProgram={targetProgram} />;
  if (kind === "createPost") return <CreatePostScreen membership={membership} />;
  if (kind === "affiliate") return <AffiliateScreen membership={membership} />;
  return (
    <div className="supporting-shell student-shell">
      <StudentNavigation membership={membership} />
      <main className="supporting-main">
        <header className="supporting-header">
          <p className="dash-kicker">{data.eyebrow}</p>
          <h1>{data.title}</h1>
          <p>{data.description}</p>
          {data.locked && <span className="supporting-badge">TERBATAS</span>}
        </header>
        <section className="supporting-grid">
          {data.cards.map((item) => (
            <article className="supporting-card" key={item.title}>
              <span className="supporting-icon" aria-hidden="true"><LuBookOpen /></span>
              <div>
                <span className="supporting-status">{item.status}</span>
                <h2>{item.title}</h2>
                <p>{item.description}</p>
              </div>
              {item.href ? (
                <Link className="supporting-action" href={`${item.href}?membership=${membership}`}>
                  {item.action ?? "Buka"} +
                </Link>
              ) : (
                <span className="supporting-action disabled" aria-disabled="true">
                  {item.action ?? "Tersedia"}
                </span>
              )}
            </article>
          ))}
        </section>
        {data.notice && (
          <aside className="supporting-notice">
            <strong>{data.notice.title}</strong>
            <p>{data.notice.description}</p>
          </aside>
        )}
      </main>
    </div>
  );
}

function ProfileScreen({ membership }: { membership: "free" | "lms" | "sensei" }) {
  const { user } = useAuth();
  const initials = (user?.name ?? "").trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] ?? "").join("").toUpperCase();
  const query = `?membership=${membership}`;
  const membershipCopy =
    membership === "sensei"
      ? "Belajar dengan Sensei"
      : membership === "lms"
      ? "Belajar Mandiri"
      : "Free Member";

  const [codeCopied, setCodeCopied] = useState(false);

  const copyReferral = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText("HIRU-HILMI");
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  return (
    <div className="supporting-shell student-shell">
      <StudentNavigation membership={membership} />
      <main className="supporting-main profile-page">
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
              <span className="profile-pill"><LuRoute aria-hidden="true" /> Level N4</span>
              <span className="profile-pill"><LuFlag aria-hidden="true" /> Target JLPT: Des 2026</span>
              <span className="profile-pill"><LuCalendar aria-hidden="true" /> Bergabung: 12 Januari 2026</span>
            </div>
          </div>
        </section>
        <section className="profile-membership">
          <div>
            <p className="dash-kicker">STATUS MEMBERSHIP</p>
            <h2>{membershipCopy}</h2>
            <p>Akses aktif hingga 31 Desember 2026. Seluruh progres belajar tersimpan.</p>
          </div>
          <Link className="button button-primary" href={`/renewal${query}`}>Perpanjang Membership</Link>
        </section>
        <section className="profile-stats">
          {[["65%", "Progres N4"], ["450", "Kanji dikuasai"], ["12", "Hari beruntun"]].map(([value, label]) => (
            <div key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </section>
        <section className="profile-certificates">
          <div className="profile-section-header">
            <h2>Sertifikat</h2>
          </div>
          <div className="profile-cert-grid">
            <Link className="profile-cert-card" href={`/certificate/n5${query}`}>
              <div className="profile-cert-top">
                <LuCircleCheck className="cert-check-icon" aria-hidden="true" />
                <span className="cert-badge verified">Diterbitkan</span>
              </div>
              <strong>Sertifikat JLPT N5</strong>
              <small>Program JLPT N5 • Diterbitkan 15 Des 2025</small>
            </Link>
            <Link className="profile-cert-card pending" href={`/certificate/n4${query}`}>
              <div className="profile-cert-top">
                <LuClock className="cert-clock-icon" aria-hidden="true" />
                <span className="cert-badge pending">Dalam Proses</span>
              </div>
              <strong>Sertifikat JLPT N4</strong>
              <small>Program JLPT N4 • Menyelesaikan Journey N4</small>
            </Link>
          </div>
          <div className="profile-cert-footer">
            <Link className="button button-secondary profile-all-cert-btn" href={`/certificate${query}`}>
              Lihat Semua Sertifikat →
            </Link>
          </div>
        </section>
        <section className="profile-referral">
          <div className="profile-section-header">
            <div>
<p className="dash-kicker">PROGRAM AFFILIATE</p>
              <h2>Kode referral saya</h2>
            </div>
            <Link className="button button-secondary" href={`/affiliate${query}`}>Buka Halaman Affiliate →</Link>
          </div>
          <strong>HIRU-HILMI</strong>
          <p>Ajak teman belajar bahasa Jepang di HIRU Academy. Teman mendapat diskon pendaftaran, dan reward milikmu aktif setelah invoice terverifikasi.</p>
          <div className="profile-referral-actions">
            <span>1 reward diskon tersedia (Rp 150.000)</span>
            <button type="button" className="button button-secondary" onClick={copyReferral}>
              {codeCopied ? <><LuCheck aria-hidden="true" /> Tersalin!</> : <><LuCopy aria-hidden="true" /> Salin Kode</>}
            </button>
            <Link className="button button-primary" href={`/renewal${query}`}>Gunakan Reward</Link>
          </div>
        </section>
        <section className="profile-settings">
          <h2>Pengaturan akun</h2>
          <div>
            <article>
              <span aria-hidden="true"><LuUser /></span>
              <div>
                <strong>Edit Profil</strong>
                <small>Nama, WhatsApp, dan preferensi belajar.</small>
              </div>
            </article>
            <article>
              <span aria-hidden="true"><LuKey /></span>
              <div>
                <strong>Ganti Kata Sandi</strong>
                <small>Perbarui keamanan akun.</small>
              </div>
            </article>
            <Link href={`/notifications${query}`}>
              <span aria-hidden="true"><LuBell /></span>
              <div>
                <strong>Notifikasi</strong>
                <small>Atur pengingat belajar dan informasi kelas.</small>
              </div>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function AffiliateScreen({ membership }: { membership: "free" | "lms" | "sensei" }) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const referralCode = "HIRU-HILMI25";
  const referralLink = "hiruacademy.com/daftar?ref=HIRU-HILMI25";
  const shareMessage = encodeURIComponent(
    "Ayo belajar bahasa Jepang di HIRU Academy! Gunakan kode affiliate HIRU-HILMI25 untuk mendapatkan diskon pendaftaran: hiruacademy.com/daftar?ref=HIRU-HILMI25"
  );
  const waUrl = `https://api.whatsapp.com/send?text=${shareMessage}`;

  const copyToClipboard = (text: string, isCode: boolean) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      if (isCode) {
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 2000);
      } else {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      }
    }
  };

  const stats = [
    { label: "Total Klik", value: "120", desc: "Jumlah klik pada link affiliate" },
    { label: "Total Daftar", value: "18", desc: "Pendaftar dari link affiliate" },
    { label: "Total Pembelian", value: "5", desc: "Pembelian dari referral" },
    { label: "Total Komisi", value: "Rp750.000", desc: "Total komisi affiliate" },
    { label: "Komisi Belum Dicairkan", value: "Rp300.000", desc: "Komisi menunggu pencairan" },
    { label: "Komisi Sudah Dicairkan", value: "Rp450.000", desc: "Komisi yang telah dicairkan" },
  ];

  const steps = [
    { number: "01", title: "Klik", desc: "Orang membuka link affiliate yang kamu bagikan." },
    { number: "02", title: "Daftar", desc: "Pendaftar membuat akun melalui link affiliate." },
    { number: "03", title: "Menunggu pembayaran", desc: "Referral menunggu pembayaran program." },
    { number: "04", title: "Sudah bayar", desc: "Pembayaran referral berhasil diterima." },
    { number: "05", title: "Komisi valid", desc: "Komisi memenuhi ketentuan program affiliate." },
    { number: "06", title: "Komisi dicairkan", desc: "Komisi telah dibayarkan kepada affiliate." },
    { number: "07", title: "Dibatalkan", desc: "Referral dibatalkan sesuai status transaksi." },
  ];

  const history = [
    { id: "REF-1024", name: "Ahmad", program: "N4 Belajar Mandiri", date: "4 Mar 2026", status: "Sudah bayar", statusClass: "active", reward: "Rp. 20.000" },
    { id: "REF-1017", name: "Shinta", program: "N3 Belajar bersama sensei", date: "28 Feb 2026", status: "Menunggu pembayaran", statusClass: "pending", reward: "Rp. 0" },
    { id: "REF-1008", name: "Ayu", program: "N4 Belajar Mandiri", date: "14 Feb 2026", status: "Komisi valid", statusClass: "active", reward: "Rp. 150.000" },
    { id: "REF-0998", name: "Budi", program: "N5 Belajar Mandiri", date: "2 Feb 2026", status: "Dibatalkan", statusClass: "cancelled", reward: "Rp. 0" },
  ];

  return (
    <div className="supporting-shell student-shell">
      <StudentNavigation membership={membership} />
      <main className="supporting-main affiliate-page">
        <header className="supporting-header">
          <p className="dash-kicker">PROGRAM AFILIASI &amp; REFERRAL</p>
          <h1>Program Affiliate Hiru Academy</h1>
          <p>Bagikan kode atau link affiliate. Teman mendapat diskon pendaftaran, dan kamu memperoleh komisi.</p>
        </header>

        <section className="affiliate-share-card">
          <div className="affiliate-code-box">
            <label>Kode Referral Unik</label>
            <div className="affiliate-input-row">
              <code>{referralCode}</code>
              <button
                type="button"
                className="button button-primary"
                onClick={() => copyToClipboard(referralCode, true)}
              >
                {codeCopied ? <><LuCheck aria-hidden="true" /> Tersalin!</> : <><LuCopy aria-hidden="true" /> Salin Kode</>}
              </button>
            </div>
          </div>

          <div className="affiliate-link-box">
            <label>Tautan Pendaftaran Referral</label>
            <div className="affiliate-input-row">
              <input type="text" readOnly value={referralLink} />
              <button
                type="button"
                className="button button-secondary"
                onClick={() => copyToClipboard(referralLink, false)}
              >
                {linkCopied ? <><LuCheck aria-hidden="true" /> Tersalin!</> : <><LuCopy aria-hidden="true" /> Salin Link</>}
              </button>
            </div>
          </div>

          <div className="affiliate-wa-row">
            <a
              className="button button-wa"
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <LuShare2 aria-hidden="true" /> Bagikan ke WhatsApp
            </a>
            <small>Pesan otomatis siap kirim dengan link pendaftaranmu.</small>
          </div>
        </section>

        <section className="affiliate-stats-grid" aria-label="Statistik referral">
          {stats.map((item) => (
            <article key={item.label} className="affiliate-stat-card">
              <p>{item.label}</p>
              <strong>{item.value}</strong>
              <small>{item.desc}</small>
            </article>
          ))}
        </section>

        <section className="affiliate-flow-section">
          <h2>Alur Status &amp; Cara Kerja</h2>
          <div className="affiliate-flow-grid">
            {steps.map((step) => (
              <article key={step.number} className="affiliate-flow-step">
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="affiliate-history-section">
          <div className="affiliate-history-head">
            <div>
<h2>Riwayat Referral</h2>
               <p>Nama program, status referral, dan komisi dari setiap referral.</p>
            </div>
            
          </div>

          <div className="affiliate-table-container">
            <table className="affiliate-table">
              <thead>
                <tr>
<th>Nama</th>
                   <th>Program</th>
                  <th>Tanggal</th>
                  <th>Status</th>
                  <th>Komisi</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                      <small>{row.id}</small>
                    </td>
                    <td>{row.program}</td>
                    <td>{row.date}</td>
                    <td>
                      <span className={`affiliate-badge status-${row.statusClass}`}>{row.status}</span>
                    </td>
                    <td>{row.reward}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function RenewalScreen({ membership, breadcrumbCurrent, targetProgram }: { membership: "free" | "lms" | "sensei"; breadcrumbCurrent?: string; targetProgram?: string }) {
  const currentLevel = membership === "free" ? undefined : getCurrentDemoUser().purchasedLevel || "N4";
  const currentIndex = jlptLevels.indexOf(currentLevel?.toUpperCase() as (typeof jlptLevels)[number]);
  const higherJlpt = currentIndex < 0 ? [...jlptLevels] : jlptLevels.slice(currentIndex + 1);
  const programOptions = [...higherJlpt, "SSW", "INTERVIEW"];
  const requested = targetProgram?.toUpperCase();
  const initialProgram = requested && programOptions.includes(requested as (typeof programOptions)[number]) ? requested : programOptions[0];
  const [program, setProgram] = useState(initialProgram);
  const [plan, setPlan] = useState<"lms" | "sensei">("lms");
  const [rewardApplied, setRewardApplied] = useState(false);
  const query = `?membership=${membership}`;
  const isJlpt = program?.startsWith("N");
  const programLabel = program === "SSW" ? "SSW Pengolahan Makanan" : program === "INTERVIEW" ? "Interview" : program ? `JLPT ${program}` : "Tidak ada level JLPT lebih tinggi";

  function createRenewalInvoice() {
    if (!program) return;
    const user = getCurrentDemoUser();
    const invoice = createPublicInvoice({ level: program, plan, name: user.name, email: user.email, whatsapp: user.whatsapp });
    window.open(getInvoiceWhatsAppUrl(invoice), "_blank", "noopener,noreferrer");
  }

  const membershipDisplayTitle = membership === "sensei" ? "Kelas bersama Sensei" : membership === "lms" ? "Belajar Mandiri" : "Free Member";
  const activeLevelDisplay = currentLevel ? `JLPT ${currentLevel}` : "Chapter 1";

  return (
    <div className="supporting-shell student-shell">
      <StudentNavigation membership={membership} />
      <main className="supporting-main renewal-page">
        <div className="renewal-top-nav">
          <Link className="renewal-top-back" href={`/profile${query}`}>
            <LuArrowLeft aria-hidden="true" />
            <span>Kembali ke Profil</span>
          </Link>
          {breadcrumbCurrent && (
            <StudentBreadcrumb
              items={[
                { label: "Membership", href: `/renewal${query}` },
                { label: breadcrumbCurrent },
              ]}
            />
          )}
        </div>

        <header className="supporting-header renewal-header">
          <p className="dash-kicker">MEMBERSHIP RENEWAL</p>
          <h1>Lanjutkan Akses Tanpa Kehilangan Progres</h1>
          <p>Harga dan periode baru tampil setelah plan dipilih; data berasal dari paket resmi HIRU Academy.</p>
        </header>

        {/* Banner Status Aktif */}
        <section className="renewal-current-banner">
          <div className="banner-left">
            <div className="banner-shield-icon" aria-hidden="true">
              <LuShieldCheck />
            </div>
            <div className="banner-copy">
              <div className="banner-status-pill">
                <LuCircleCheck aria-hidden="true" />
                <span>Membership Aktif</span>
              </div>
              <h2>
                {membershipDisplayTitle} • {activeLevelDisplay}
              </h2>
              <p>Akses aktif hingga 31 Desember 2026. Progres tetap tersimpan setelah perpanjangan.</p>
            </div>
          </div>
        </section>

        {/* STEP 1 • Pilih Program / Level */}
        <section className="renewal-step-section">
          <div className="renewal-step-header">
            <div className="renewal-step-badge">
              <LuTag aria-hidden="true" />
              <span>STEP 1</span>
            </div>
            <h2>Pilih Program / Level</h2>
            <p>Pilih program atau level lanjutan yang ingin kamu pelajari.</p>
          </div>
          <div className="renewal-program-grid">
            {programOptions.map((option) => {
              const isSelected = program === option;
              const isSsw = option === "SSW";
              const isInterview = option === "INTERVIEW";
              const label = isSsw ? "SSW Pengolahan Makanan" : isInterview ? "Interview" : `JLPT ${option}`;
              const badgeLabel = isSsw || isInterview ? "PROGRAM STANDALONE" : "UPGRADE JLPT";

              return (
                <button
                  key={option}
                  type="button"
                  className={`renewal-program-card ${isSelected ? "selected" : ""}`}
                  onClick={() => {
                    setProgram(option);
                    if (isSsw || isInterview) setPlan("lms");
                  }}
                  aria-pressed={isSelected}
                >
                  <div className="renewal-card-top-row">
                    <span className={`renewal-program-icon-badge ${isSsw ? "icon-chef" : isInterview ? "icon-work" : "icon-jlpt"}`} aria-hidden="true">
                      {isSsw ? <LuChefHat /> : isInterview ? <LuBriefcase /> : <LuAward />}
                    </span>
                    <span className="renewal-category-pill">{badgeLabel}</span>
                    {isSelected && (
                      <span className="renewal-card-check" aria-hidden="true">
                        <LuCircleCheck />
                      </span>
                    )}
                  </div>
                  <div className="renewal-card-body">
                    <strong className="renewal-program-title">{label}</strong>
                    <p className="renewal-program-sub">
                      {isSsw
                        ? "Materi spesifik keahlian pengolahan makanan industri Jepang."
                        : isInterview
                          ? "Persiapan interview kerja & wawancara visa Jepang."
                          : `Pemantapan materi dan simulasi ujian JLPT ${option}.`}
                    </p>
                  </div>
                </button>
              );
            })}
            {!programOptions.length && (
              <p className="renewal-empty-hint">Tidak ada level JLPT lebih tinggi. Program standalone tetap dapat dipilih.</p>
            )}
          </div>
        </section>

        {/* STEP 2 • Pilih Paket Belajar */}
        <section className="renewal-step-section">
          <div className="renewal-step-header">
            <div className="renewal-step-badge">
              <LuLayers3 aria-hidden="true" />
              <span>STEP 2</span>
            </div>
            <h2>Pilih Paket Belajar</h2>
            <p>Pilih metode pembelajaran yang sesuai dengan ritme dan kebutuhan bimbinganmu.</p>
          </div>
          <div className="renewal-plans-grid">
            <button
              className={`renewal-plan-card ${plan === "lms" ? "selected" : ""}`}
              type="button"
              onClick={() => setPlan("lms")}
              aria-pressed={plan === "lms"}
            >
              <div className="renewal-plan-header">
                <div className="renewal-plan-icon-wrap" aria-hidden="true">
                  <LuBookOpen />
                </div>
                <div className="renewal-plan-titles">
                  <span className="renewal-plan-badge">LMS</span>
                  <h3>Belajar Mandiri</h3>
                </div>
                {plan === "lms" && (
                  <span className="renewal-plan-check" aria-hidden="true">
                    <LuCircleCheck />
                  </span>
                )}
              </div>
              <p className="renewal-plan-desc">
                Journey penuh, try out, review, sertifikat, dan forum diskusi.
              </p>
              <div className="renewal-plan-price-box">
                <span className="renewal-price-val">Rp 99.000</span>
                <span className="renewal-price-period">/ 6 Bulan</span>
              </div>
            </button>

            {isJlpt && (
              <button
                className={`renewal-plan-card ${plan === "sensei" ? "selected" : ""}`}
                type="button"
                onClick={() => setPlan("sensei")}
                aria-pressed={plan === "sensei"}
              >
                <div className="renewal-plan-header">
                  <div className="renewal-plan-icon-wrap sensei" aria-hidden="true">
                    <LuGraduationCap />
                  </div>
                  <div className="renewal-plan-titles">
                    <div className="renewal-title-badges">
                      <span className="renewal-plan-badge sensei">SENSEI</span>
                      <span className="renewal-popular-tag">Paling Populer</span>
                    </div>
                    <h3>Kelas bersama Sensei</h3>
                  </div>
                  {plan === "sensei" && (
                    <span className="renewal-plan-check" aria-hidden="true">
                      <LuCircleCheck />
                    </span>
                  )}
                </div>
                <p className="renewal-plan-desc">
                  Semua LMS ditambah cohort, jadwal Zoom, bimbingan Sensei, dan replay.
                </p>
                <div className="renewal-plan-price-box">
                  <span className="renewal-price-val">Rp 350.000</span>
                  <span className="renewal-price-period">/ Bulan</span>
                </div>
              </button>
            )}
          </div>
        </section>

        {/* Reward Referral */}
        <section className="renewal-reward-card">
          <div className="renewal-reward-content">
            <div className="renewal-reward-icon-wrap" aria-hidden="true">
              <LuGift />
            </div>
            <div className="renewal-reward-text">
              <div className="renewal-reward-kicker">
                <LuGift aria-hidden="true" />
                <span>REWARD REFERRAL TERSEDIA</span>
              </div>
              <h3>Gunakan reward diskon pada invoice renewal berikutnya</h3>
              <p>Saldo reward aktif dapat langsung memotong total pembayaranmu.</p>
            </div>
          </div>
          <button
            type="button"
            className={`renewal-reward-button ${rewardApplied ? "applied" : ""}`}
            aria-pressed={rewardApplied}
            onClick={() => setRewardApplied((prev) => !prev)}
          >
            {rewardApplied ? (
              <>
                <LuCheck aria-hidden="true" />
                <span>Reward Diterapkan</span>
              </>
            ) : (
              <>
                <LuGift aria-hidden="true" />
                <span>Gunakan Reward</span>
              </>
            )}
          </button>
        </section>

        {/* Summary Card */}
        <section className="renewal-summary-card">
          <div className="renewal-summary-head">
            <div className="renewal-summary-tag">
              <LuReceipt aria-hidden="true" />
              <span>RINGKASAN RENEWAL</span>
            </div>
            <h2>{programLabel} • {plan === "lms" ? "Belajar Mandiri" : "Kelas bersama Sensei"}</h2>
            <p className="renewal-summary-desc"><strong>Program:</strong> {programLabel}<br /><strong>Paket:</strong> {plan === "lms" ? "Belajar Mandiri" : "Kelas bersama Sensei"}<br />{rewardApplied && "Reward referral diterapkan. "}Rincian pembayaran dan tanggal aktif baru akan dikirimkan melalui WhatsApp.</p>
          </div>

          <div className="renewal-summary-grid">
            <div className="summary-item">
              <span className="label">Program Dipilih</span>
              <strong className="value">{programLabel}</strong>
              <small>{isJlpt ? "Sertifikasi Standar JLPT" : "Program Keahlian Terarah"}</small>
            </div>
            <div className="summary-item">
              <span className="label">Paket Belajar</span>
              <strong className="value">{plan === "lms" ? "Belajar Mandiri (LMS)" : "Kelas bersama Sensei"}</strong>
              <small>{plan === "lms" ? "Akses Mandiri 6 Bulan" : "Live Zoom & Bimbingan Sensei"}</small>
            </div>
            <div className="summary-item">
              <span className="label">Biaya Investasi</span>
              <strong className="value text-orange">{plan === "lms" ? "Rp 99.000" : "Rp 350.000"}</strong>
              <small>{rewardApplied ? "✓ Diskon referral aktif" : "Tarif resmi terdaftar"}</small>
            </div>
          </div>

          <div className="renewal-invoice-action">
            <button
              className="renewal-submit-button"
              type="button"
              onClick={createRenewalInvoice}
              disabled={!program}
            >
              <FaWhatsapp className="whatsapp-icon" aria-hidden="true" />
              <span>Buat Invoice &amp; Buka WhatsApp</span>
              <LuReceipt className="receipt-icon" aria-hidden="true" />
            </button>
          </div>
        </section>

        {/* Announcement Box */}
        <aside className="renewal-announcement-box">
          <div className="renewal-announcement-header">
            <LuInfo aria-hidden="true" />
            <strong>Pengumuman</strong>
          </div>
          <p>Membership aktif setelah pembayaran via WhatsApp dan invoice diverifikasi Admin.</p>
        </aside>
      </main>
    </div>
  );
}

function NotificationScreen({ membership }: { membership: "free" | "lms" | "sensei" }) {
  const [filter, setFilter] = useState("Semua");
  const [allRead, setAllRead] = useState(false);
  const [page, setPage] = useState(1);
  const query = `?membership=${membership}`;
  const publishedAnnouncements = usePublishedAnnouncements(membership);

  const activeAnnouncements = useMemo(() => {
    return publishedAnnouncements
      .filter((an) => !an.audience || an.audience === "all" || an.audience === membership)
      .map((an) => ({
        icon: LuBell,
        category: "Pengumuman",
        title: an.title,
        description: an.content,
        action: an.ctaLabel || "Lihat Detail",
        href: an.ctaPath ? (an.ctaPath.startsWith("/") ? `${an.ctaPath}${an.ctaPath.includes("?") ? "&" : "?"}membership=${membership}` : an.ctaPath) : undefined,
        isRead: false,
        priority: an.priority,
        date: an.startAt
          ? new Date(an.startAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
          : "Hari ini",
      }));
  }, [publishedAnnouncements, membership]);

  const third =
    membership === "sensei"
      ? { icon: LuRotateCcw, category: "Kelas", title: "Replay kelas sudah dipublikasikan", description: "Replay dapat ditonton selama masa aktif cohort.", action: "Buka Replay", href: `/replay${query}`, isRead: false, priority: undefined, date: "Hari ini" }
      : membership === "lms"
      ? { icon: LuBookOpen, category: "Kelas", title: "Feedback materi sudah diperbarui", description: "Penjelasan tata bahasa Bab 12 telah dilengkapi contoh kalimat baru.", action: "Buka Feedback", href: undefined, isRead: false, priority: undefined, date: "Hari ini" }
      : { icon: LuRoute, category: "Kelas", title: "Progress chapter diperbarui", description: "Catatan progres chapter aktifmu berhasil diperbarui.", action: "Buka Progress", href: `/progress${query}`, isRead: false, priority: undefined, date: "Hari ini" };
  const today = [
    ...activeAnnouncements,
    { icon: LuBookOpen, category: "Belajar", title: "Materi Chapter 4 tersedia", description: "Lanjutkan video, modul, dan latihan pada journey aktif.", action: "Buka Chapter", href: `/learn/n4/${membership === "free" ? "chapter-1" : "chapter-4"}${query}`, isRead: false, priority: undefined, date: "Hari ini" },
    { icon: LuCalendar, category: "Kelas", title: "Pengingat sesi Zoom", description: "Sesi bimbingan mingguan bersama Sensei akan dimulai besok malam.", action: "Lihat Jadwal", href: membership === "sensei" ? `/schedule${query}` : undefined, isRead: false, priority: undefined, date: "Hari ini" },
    third,
  ];
  const previous = [
    { icon: LuFlame, category: "Achievement", title: "Achievement baru terbuka", description: "Streak belajar berhasil mencapai milestone baru.", action: "Lihat Achievement", href: `/progress${query}`, isRead: true, priority: undefined, date: "Sebelumnya" },
    { icon: LuClock, category: "Akun", title: "Periode membership akan berakhir", description: "Masa aktif belajarmu tersisa 30 hari. Perpanjang untuk mempertahankan streak.", action: "Lihat Membership", href: `/profile${query}`, isRead: true, priority: undefined, date: "Sebelumnya" },
    { icon: LuAward, category: "Achievement", title: "Sertifikat digital tersedia", description: "Sertifikat dapat dilihat dan diunduh dari Certificate Center.", action: "Buka Sertifikat", href: membership === "free" ? undefined : `/certificate${query}`, isRead: true, priority: undefined, date: "Sebelumnya" },
  ];
  const matches = (item: { category: string; isRead?: boolean }) => {
    if (filter === "Semua") return true;
    if (filter === "Belum Dibaca") return !allRead && !item.isRead;
    if (filter === "Akun") return item.category === "Akun";
    return item.category === filter;
  };
  const visibleToday = today.filter(matches);
  const visiblePrevious = previous.filter(matches);
  const renderItem = (item: typeof today[number]) => {
    const Icon = item.icon;
    return (
      <article className={allRead || item.isRead ? "read" : "unread"} key={item.title}>
        <span className="notification-icon" aria-hidden="true"><Icon /></span>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
            <small>{item.category} • {item.date}</small>
            {item.priority && (
              <span
                style={{
                  display: "inline-block",
                  padding: "1px 7px",
                  borderRadius: "999px",
                  fontSize: "9px",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  background: item.priority === "Important" ? "#fee2e2" : "#e0f2fe",
                  color: item.priority === "Important" ? "#991b1b" : "#0369a1",
                }}
              >
                {item.priority === "Important" ? "Penting" : "Pengumuman"}
              </span>
            )}
          </div>
          <h2>{item.title}</h2>
          <p>{item.description}</p>
        </div>
        {item.href ? <Link href={item.href}>{item.action}</Link> : <span className="notification-locked" aria-disabled="true">{item.action}</span>}
      </article>
    );
  };
  return (
    <div className="supporting-shell student-shell">
      <StudentNavigation membership={membership} />
      <main className="supporting-main notification-page">
        <div className="progress-title-row">
          <header className="supporting-header">
            <p className="dash-kicker">NOTIFICATION CENTER</p>
            <h1>Informasi penting tanpa mengganggu fokus</h1>
            <p>Notifikasi pengingat belajar, pembaruan materi, dan informasi kelas penting.</p>
          </header>
          <Link href={`/profile${query}`}>Profil</Link>
        </div>
        <div className="notification-toolbar">
          <div>
            {["Semua", "Belum Dibaca", "Pengumuman", "Belajar", "Kelas", "Akun"].map((item) => (
              <button className={filter === item ? "active" : ""} type="button" onClick={() => setFilter(item)} key={item}>{item}</button>
            ))}
          </div>
          <button type="button" onClick={() => setAllRead(true)}>Tandai Semua Dibaca</button>
        </div>
        {visibleToday.length || visiblePrevious.length ? (
          <>
            <section className="notification-group"><h2>Hari ini</h2>{visibleToday.map(renderItem)}</section>
            <section className="notification-group"><h2>Sebelumnya</h2>{visiblePrevious.map(renderItem)}</section>
          </>
        ) : (
          <section className="library-empty"><h2>Tidak ada notifikasi</h2><p>Belum ada notifikasi pada filter ini.</p></section>
        )}
        <div className="notification-pagination">
          <span>Menampilkan 1–20 dari 148 data</span>
          <nav aria-label="Pagination">
            {["‹", "1", "2", "3", "…", "8", "›"].map((item, index) => (
              <button
                className={String(page) === item ? "active" : ""}
                type="button"
                onClick={() => {
                  if (item === "‹") setPage((value) => Math.max(1, value - 1));
                  else if (item === "›") setPage((value) => Math.min(8, value + 1));
                  else {
                    const value = Number(item);
                    if (value) setPage(value);
                  }
                }}
                key={`${item}-${index}`}
              >
                {item}
              </button>
            ))}
          </nav>
        </div>
        <section className="notification-preferences">
          <header><h2>Preferensi notifikasi</h2><p>Channel dan kategori mengikuti pengaturan akun.</p></header>
          <div>
            {[
              { icon: LuBell, title: "In-App", desc: "Pengumuman dan aktivitas belajar di aplikasi.", status: "Aktif" },
              { icon: LuMail, title: "Email", desc: "Kelas, akun, dan transaksi.", status: "Aktif" },
              { icon: LuBookOpen, title: "Belajar", desc: "Journey, latihan, dan achievement.", status: "Aktif" },
              { icon: LuMessagesSquare, title: "Community", desc: "Balasan dan aktivitas thread.", status: "Opsional" },
              { icon: LuTag, title: "Promosi", desc: "Konten informasi promo dan reward.", status: "Off" },
            ].map(({ icon: Icon, title, desc, status }) => (
              <article key={title}>
                <span aria-hidden="true"><Icon /></span>
                <div><strong>{title}</strong><small>{desc}</small></div>
                <b>{status}</b>
              </article>
            ))}
          </div>
        </section>
        <aside className="notification-announcement"><strong>Pengumuman</strong><p>Notifikasi transaksi dan keamanan akun tetap dikirim ke email terdaftar.</p></aside>
      </main>
    </div>
  );
}

function CertificateScreen({ membership }: { membership: "free" | "lms" | "sensei" }) {
  const { user } = useAuth();
  const query = `?membership=${membership}`;
  if (membership === "free") return (
    <div className="supporting-shell student-shell">
      <StudentNavigation membership={membership} />
      <main className="supporting-main">
        <section className="sensei-status-panel">
          <p className="dash-kicker">AKSES PREMIUM</p>
          <h1>Akses ini belum aktif pada Free Member</h1>
          <p>Sertifikat tersedia sesuai program belajar dan kelulusan yang telah diverifikasi.</p>
          <div className="status-actions">
            <Link className="button button-primary" href={`/renewal${query}`}>Lihat Membership</Link>
            <Link className="button button-secondary" href={`/dashboard${query}`}>Kembali Dashboard</Link>
          </div>
        </section>
      </main>
    </div>
  );

  const certificates = [
    { icon: LuAward, title: "Sertifikat JLPT N5", program: "Program JLPT N5", recipient: user?.name ?? "", status: "Diterbitkan", href: `/certificate/n5${query}`, action: "Lihat Sertifikat", available: true },
    { icon: LuLock, title: "Sertifikat belum tersedia", program: "Sertifikat JLPT N4", status: "Dalam Proses", action: "Lihat Kriteria", href: `/certificate/n4${query}`, available: false },
    { icon: LuLock, title: "Sertifikat belum tersedia", program: "Sertifikat JLPT N3", status: "Belum Memenuhi", action: "Lihat Kriteria", href: `/certificate/n3${query}`, available: false },
  ];

  return (
    <div className="supporting-shell student-shell">
      <StudentNavigation membership={membership} />
      <main className="supporting-main certificate-page">
        <div className="progress-title-row">
          <header className="supporting-header">
            <p className="dash-kicker">CERTIFICATE CENTER</p>
            <h1>Sertifikat digital dari milestone yang tervalidasi</h1>
            <p>Kelulusan, penerbitan, unduh, dan status sertifikat resmi digital HIRU Academy.</p>
          </header>
          <Link href={`/profile${query}`}>Profil</Link>
        </div>
        <section className="certificate-summary">
          <p className="dash-kicker">DIGITAL CREDENTIALS</p>
          <h2>Satu sertifikat telah diterbitkan</h2>
          <p>Jumlah, program, dan kelulusan mengikuti progres serta assessment yang valid.</p>
          <div className="certificate-flow">
            <span>Selesaikan journey</span>
            <span>Penuhi assessment</span>
            <span>Sertifikat terbit</span>
            <span>Download / share</span>
          </div>
        </section>
        <section className="certificate-grid">
          {certificates.map((item, index) => {
            const Icon = item.icon;
            return (
              <article key={index} className={item.available ? "available" : "locked"}>
                <span aria-hidden="true"><Icon /></span>
                <small>{item.available ? "DIGITAL" : ""}</small>
                <h2>{item.title}</h2>
                <p>{item.recipient ? `${item.recipient} • ` : ""}{item.program}</p>
                <b>{item.status}</b>
                {item.href ? <Link href={item.href}>{item.action} →</Link> : <button className="disabled" type="button" aria-disabled="true">{item.action} →</button>}
              </article>
            );
          })}
        </section>
        <aside className="certificate-notice"><strong>Pengumuman</strong><p>Sertifikat tersedia setelah seluruh kriteria kelulusan terpenuhi.</p></aside>
      </main>
    </div>
  );
}

function CommunityScreen({ membership }: { membership: "free" | "lms" | "sensei" }) {
  const [search, setSearch] = useState("");
  const query = `?membership=${membership}`;
  const isSensei = membership === "sensei";
  const canWrite = membership !== "free";
  const posts = [
    { id: "post-1", tag: isSensei ? "Tanya Sensei" : "Diskusi Member", title: "Perbedaan penggunaan に dan で untuk tempat?", summary: "Pertanyaan grammar untuk memahami konteks aktivitas dan lokasi.", href: `/community/post-1${query}` },
    { id: "post-2", tag: "Semua Akses", title: "Pengingat jadwal dan materi minggu ini", summary: "Info dari HIRU untuk seluruh pembelajar.", href: undefined },
    { id: "post-3", tag: "Diskusi Member", title: "Tips menjaga konsistensi flashcard N4", summary: "Forum diskusi dengan sesama pembelajar.", href: undefined },
  ];
  const visible = posts.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="supporting-shell student-shell">
      <StudentNavigation membership={membership} />
      <main className="supporting-main community-page">
        <div className="progress-title-row">
          <header className="supporting-header">
            <p className="dash-kicker">FORUM KOMUNITAS</p>
            <h1>Berdiskusi, bertanya, dan berbagi perjalanan belajar</h1>
            <p>
              {isSensei
                ? "Belajar dengan Sensei dapat membuat post, membalas komentar, dan menggunakan Tanya Sensei."
                : canWrite
                ? "Belajar Mandiri dapat membuat post, membalas komentar, dan berdiskusi di forum."
                : "Free Member dapat membaca seluruh diskusi aktif. Post dan komentar terbuka setelah upgrade."}
            </p>
          </header>
          {canWrite && <Link className="button button-dark" href={`/community/create${query}`}>Buat Postingan</Link>}
        </div>
        <section className="community-access-grid">
          {[
            ["Tanya Sensei", "Pertanyaan untuk pengajar pada plan Belajar dengan Sensei."],
            ["Diskusi Member", "Forum diskusi dengan sesama pembelajar."],
            ["Info dari HIRU", "Pengumuman, event, dan informasi akademi."],
            ["Kerja ke Jepang", "Informasi karier dan persiapan profesional."],
          ].map(([title, desc]) => (
            <article key={title}><strong>{title}</strong><p>{desc}</p></article>
          ))}
        </section>
        <section className="community-feed-head">
          <div><p className="dash-kicker">Diskusi terbaru</p><small>Aktivitas diskusi pembelajar aktif.</small></div>
          <label className="library-search">
            <span aria-hidden="true"><LuSearch /></span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari diskusi atau topik" />
          </label>
        </section>
        <section className="community-list">
          {visible.map((post) => (
            <article key={post.id}>
              <div>
                <span>{post.tag}</span>
                <h2>{post.title}</h2>
                <p>{post.summary}</p>
              </div>
              {post.href ? <Link className="button button-primary" href={post.href}>Buka</Link> : <span className="button button-secondary disabled" aria-disabled="true">Belum tersedia</span>}
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

function CreatePostScreen({ membership }: { membership: "free" | "lms" | "sensei" }) {
  const [submitted, setSubmitted] = useState(false);
  const query = `?membership=${membership}`;
  if (membership === "free") return (
    <div className="supporting-shell student-shell">
      <StudentNavigation membership={membership} />
      <main className="supporting-main">
        <section className="sensei-status-panel">
          <p className="dash-kicker">COMMUNITY • READ ONLY</p>
          <h1>Postingan baru belum tersedia</h1>
          <p>Free Member dapat membaca thread. Hak membuat postingan tersedia pada paket Belajar Mandiri atau Sensei.</p>
          <Link className="button button-secondary" href={`/community${query}`}>Kembali ke Community</Link>
        </section>
      </main>
    </div>
  );

  if (submitted) return (
    <div className="supporting-shell student-shell">
      <StudentNavigation membership={membership} />
      <main className="supporting-main">
        <section className="sensei-status-panel">
          <p className="dash-kicker">COMMUNITY</p>
          <h1>Postingan siap ditinjau</h1>
          <p>Postingan berhasil dikirim dan dapat melalui proses moderasi.</p>
          <Link className="button button-primary" href={`/community${query}`}>Kembali ke Community</Link>
        </section>
      </main>
    </div>
  );

  return (
    <div className="supporting-shell student-shell">
      <StudentNavigation membership={membership} />
      <main className="supporting-main">
        <StudentBreadcrumb items={[{ label: "Diskusi Member", href: `/community${query}` }, { label: "Buat Diskusi" }]} />
        <header className="supporting-header">
          <p className="dash-kicker">BUAT POSTINGAN</p>
          <h1>Bagikan pertanyaan atau pengalaman belajar</h1>
        </header>
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}>
          <label><span>Kategori</span><select><option>Diskusi Member</option><option>Tanya Sensei</option></select></label>
          <label><span>Judul</span><input required placeholder="Tulis judul postingan" /><small>Tulis judul yang spesifik agar mudah ditemukan.</small></label>
          <label><span>Ringkasan</span><textarea required rows={4} /></label>
          <p>Postingan mengikuti aturan komunitas dan tata krama belajar.</p>
          <div className="button-group">
            <button type="submit" className="button button-primary">Publikasikan</button>
            <Link href={`/community${query}`} className="button button-secondary">Batal</Link>
          </div>
        </form>
      </main>
    </div>
  );
}

function ProgressScreen({ membership }: { membership: "free" | "lms" | "sensei" }) {
  const query = `?membership=${membership}`;
  const milestones = [
    ["1", "Fondasi N4", "Chapter awal dan checkpoint", "Selesai"],
    ["2", "Rutinitas Harian", "Video, modul, dan latihan", "Selesai"],
    ["3", "Pola Kalimat", "Chapter aktif", "Aktif"],
    ["4", "Try Out N4", "Tersedia setelah journey", "Terkunci"],
    ["5", "Sertifikat N4", "Mengikuti kelulusan milestone", "Terkunci"],
  ];
  return (
    <div className="supporting-shell student-shell">
      <StudentNavigation membership={membership} />
      <main className="supporting-main progress-page">
        <div className="progress-title-row">
          <header className="supporting-header">
            <h1>Rayakan progres tanpa kehilangan fokus</h1>
            <p>Progress, streak, mastery, dan pencapaian belajarmu.</p>
          </header>
        </div>
        <section className="progress-summary">
          <div className="progress-summary-info">
            <p className="dash-kicker">MEMBER LEVEL N4</p>
            <h2>Perjalanan belajar terus bertumbuh</h2>
            <p>Persentase dan milestone mengikuti progres belajar valid.</p>
          </div>
          <div className="progress-summary-tracker">
            <span className="progress-streak-badge">
              <LuFlame aria-hidden="true" /> 12 Hari Streak
            </span>
            <div className="progress-bar-wrap">
              <div
                className="progress-bar-track"
                role="progressbar"
                aria-valuenow={65}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progress Journey N4"
              >
                <div className="progress-bar-fill" style={{ width: "65%" }} />
              </div>
              <strong className="progress-bar-pct">65%</strong>
            </div>
          </div>
          <div className="progress-stats">
            {[
              { value: "450", label: "Kanji mastered", icon: LuBookOpen },
              { value: "18", label: "Latihan selesai", icon: LuCircleCheck },
              { value: "82%", label: "Akurasi", icon: LuAward },
            ].map(({ value, label, icon: Icon }) => (
              <div key={label} className="progress-stat-card">
                <span className="progress-stat-icon" aria-hidden="true"><Icon /></span>
                <strong>{value}</strong>
                <span className="progress-stat-label">{label}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="progress-milestones">
          <h2>Milestone journey</h2>
          {milestones.map(([number, title, description, status]) => (
            <article key={title} className="milestone-item">
              <span className="milestone-number">{number}</span>
              <div className="milestone-info"><strong>{title}</strong><small>{description}</small></div>
              <b className={`milestone-badge milestone-${status.toLowerCase()}`}>{status}</b>
            </article>
          ))}
        </section>
        <section className="progress-achievements">
          <div className="progress-tabs">
            <button className="active" type="button">Achievement</button>
            <Link href={`/leaderboard${query}`}>Leaderboard</Link>
          </div>
          <div>
            {[
              { icon: LuFlame, title: "Streak 7 Hari", desc: "Belajar konsisten selama tujuh hari.", status: "Terbuka" },
              { icon: LuLayers3, title: "Flashcard Master", desc: "Menyelesaikan target flashcard.", status: "Terbuka" },
              { icon: LuClipboardCheck, title: "Try Out Finisher", desc: "Menyelesaikan Try Out pertama.", status: "Belum terbuka" },
              { icon: LuAward, title: "Certificate Ready", desc: "Memenuhi syarat sertifikat.", status: "Belum terbuka" },
            ].map(({ icon: Icon, title, desc, status }) => (
              <article key={title}>
                <span aria-hidden="true"><Icon /></span>
                <h2>{title}</h2>
                <p>{desc}</p>
                <b>{status}</b>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function LeaderboardScreen({ membership }: { membership: "free" | "lms" | "sensei" }) {
  const [period, setPeriod] = useState("Mingguan");
  const query = `?membership=${membership}`;
  const rows = [
    ["04", "Member 4", "Member community", "+ 2"],
    ["05", "Member 5", "Member community", "—"],
    ["06", "Member 6", "Member community", "+ 1"],
    ["07", "Kamu", "Posisimu saat ini", "+ 3"],
    ["08", "Member 8", "Member community", "—"],
  ];
  return (
    <div className="supporting-shell student-shell">
      <StudentNavigation membership={membership} />
      <main className="supporting-main leaderboard-page">
        <div className="progress-title-row">
          <header className="supporting-header">
            <p className="dash-kicker">LEADERBOARD</p>
            <h1>Bandingkan konsistensi, bukan tekanan</h1>
            <p>Poin pengalaman (XP) dihitung dari latihan harian, chapter, dan review materi.</p>
          </header>
          <Link href={`/progress${query}`}>Progres</Link>
        </div>
        <div className="leaderboard-filters">
          {["Mingguan", "Bulanan", "N4", "Cohort", "Semua Member"].map((filter) => (
            <button className={period === filter ? "active" : ""} type="button" onClick={() => setPeriod(filter)} key={filter}>{filter}</button>
          ))}
        </div>
        <section className="leaderboard-podium">
          {[["#02", "Member 2", "11.200 XP"], ["#01", "Member 1", "12.450 XP"], ["#03", "Member 3", "10.850 XP"]].map(([rank, name, xp]) => (
            <article className={rank === "#01" ? "winner" : ""} key={rank}>
              <strong>{rank}</strong>
              <h2>{name}</h2>
              <span>{xp}</span>
            </article>
          ))}
        </section>
        <section className="leaderboard-list">
          {rows.map(([rank, name, meta, movement]) => (
            <article className={name === "Kamu" ? "current" : ""} key={rank}>
              <strong>{rank}</strong>
              <div><h2>{name}</h2><span>{meta}</span></div>
              <div><b>9.120 XP</b><small>Skor aktif</small></div>
              <i>{movement}</i>
            </article>
          ))}
        </section>
        <aside className="leaderboard-notice"><strong>Pengumuman</strong><p>Leaderboard dapat menggunakan nama samaran dan hanya menampilkan aktivitas yang diizinkan.</p></aside>
      </main>
    </div>
  );
}

type LibraryMaterialSeed = {
  id: string;
  level: string;
  type: string;
  title: string;
  description: string;
  href?: string;
};

const baseSeeds: LibraryMaterialSeed[] = [
  { id: "dasar-tb", level: "Dasar", type: "Tata Bahasa", title: "Pola Kalimat Dasar", description: "Modul pengenalan pola kalimat Jepang." },
  { id: "n5-tb", level: "N5", type: "Tata Bahasa", title: "Tata Bahasa N5", description: "Pola kalimat dasar level N5." },
  { id: "n5-kj", level: "N5", type: "Kanji", title: "Kanji Pemula", description: "Kanji dasar untuk percakapan harian." },
  { id: "n5-kk", level: "N5", type: "Kosakata", title: "Kosakata Sehari-hari", description: "Kosakata inti level N5." },
  { id: "n4-tb", level: "N4", type: "Tata Bahasa", title: "Pola Kalimat Sehari-hari", description: "Modul Chapter 4 yang terakhir dibuka." },
  { id: "n4-kj", level: "N4", type: "Kanji", title: "Keadaan, Waktu & Aktivitas", description: "Kanji chapter dengan bookmark dan catatan." },
  { id: "n4-kk", level: "N4", type: "Kosakata", title: "Kosakata Aktivitas", description: "Kosakata kontekstual level N4." },
  { id: "n3-tb", level: "N3", type: "Tata Bahasa", title: "Tata Bahasa Menengah", description: "Pola kalimat untuk teks umum." },
  { id: "n3-kj", level: "N3", type: "Kanji", title: "Kanji Menengah", description: "Kanji untuk bacaan umum level N3." },
  { id: "n3-kk", level: "N3", type: "Kosakata", title: "Kosakata Menengah", description: "Kosakata komunikasi level N3." },
  { id: "n2-tb", level: "N2", type: "Tata Bahasa", title: "Tata Bahasa Lanjutan", description: "Struktur kalimat kompleks level N2." },
  { id: "n2-kj", level: "N2", type: "Kanji", title: "Kanji Lanjutan", description: "Kanji untuk bacaan profesional level N2." },
  { id: "n2-kk", level: "N2", type: "Kosakata", title: "Kosakata Lanjutan", description: "Kosakata akademik dan profesional level N2." },
  { id: "ssw-kk", level: "SSW", type: "Kosakata", title: "Kosakata SSW Pengolahan Makanan", description: "Istilah kerja dan instruksi lapangan." },
  { id: "interview-rd", level: "Interview", type: "Reading", title: "Persiapan Interview", description: "Materi persiapan wawancara kerja." },
];

function LibraryScreen({ membership }: { membership: "free" | "lms" | "sensei" }) {
  const currentUser = getCurrentDemoUser();
  const purchasedLevel = membership === "free" ? undefined : currentUser.purchasedLevel || "N4";
  const standalonePrograms = currentUser.purchasedLevel === "SSW" || currentUser.purchasedLevel === "INTERVIEW" ? [currentUser.purchasedLevel] : [];
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("Semua");
  const [type, setType] = useState("Semua");
  const [locked, setLocked] = useState(false);
  const curriculum = usePublishedCurriculum();

  const publishedMaterials: LibraryMaterialSeed[] = useMemo(() => {
    return (curriculum.libraryMaterials || [])
      .filter((item) => item.status === "Published")
      .map((item) => {
        const itemLevel = item.programCode === "DASAR" ? "Dasar" : item.programCode === "INTERVIEW" ? "Interview" : item.programCode.toUpperCase();
        return {
          id: item.id,
          level: itemLevel,
          type: item.type,
          title: item.title,
          description: item.description,
          href: item.url || undefined,
        };
      });
  }, [curriculum.libraryMaterials]);

  const materialSeeds = useMemo(() => {
    if (!publishedMaterials.length) return baseSeeds;
    return [
      ...baseSeeds.filter((s) => !publishedMaterials.some((p) => p.title.toLowerCase() === s.title.toLowerCase())),
      ...publishedMaterials,
    ];
  }, [publishedMaterials]);

  const materials = materialSeeds.map((item) => {
    const programCode = item.level === "Dasar" ? "DASAR" : item.level === "Interview" ? "INTERVIEW" : item.level.toUpperCase();
    const isLocked = membership === "free" || !hasFullLearningAccess(programCode, purchasedLevel, standalonePrograms);
    const defaultHref = `/learn/${item.level === "Dasar" ? "dasar" : item.level.toLowerCase()}/chapter-${membership === "free" ? "1" : "4"}/${item.type === "Tata Bahasa" ? "grammar" : item.type.toLowerCase()}?membership=${membership}`;
    return {
      icon: item.type === "Kanji" ? LuLayers3 : LuBookOpen,
      level: item.level,
      type: item.type,
      title: item.title,
      description: item.description,
      status: isLocked ? "Terkunci" : "Tersedia",
      href: isLocked ? undefined : (item.href || defaultHref),
    };
  });
  const query = search.trim().toLowerCase();
  const visible = materials.filter((item) => (type === "Semua" || item.type === type) && [item.title, item.level, item.type, item.description].some((value) => value.toLowerCase().includes(query)) && (level === "Semua" || level === item.level));
  return (
    <div className="supporting-shell student-shell">
      <StudentNavigation membership={membership} />
      <main className="supporting-main library-page">
        <header className="supporting-header">
          <p className="dash-kicker">PERPUSTAKAAN MATERI</p>
          <h1>Temukan kembali materi dari seluruh journey</h1>
          <p>Akses material mengikuti level dan entitlement membership.</p>
        </header>
        <div className="library-filter-bar">
          <label className="library-search">
            <span aria-hidden="true"><LuSearch /></span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari materi, tata bahasa, kanji, atau audio" />
          </label>
          <div className="library-dropdowns">
            <div className="library-select-item">
              <label htmlFor="library-level-select">Level</label>
              <select id="library-level-select" value={level} onChange={(event) => setLevel(event.target.value)}>
                {["Semua", "Dasar", "N5", "N4", "N3", "N2", "SSW", "Interview"].map((item) => (
                  <option key={item} value={item}>{item === "Interview" ? "Persiapan Interview" : item}</option>
                ))}
              </select>
            </div>
            <div className="library-select-item">
              <label htmlFor="library-type-select">Kategori</label>
              <select id="library-type-select" value={type} onChange={(event) => setType(event.target.value)}>
                {["Semua", "Tata Bahasa", "Kanji", "Kosakata", "Audio", "Reading"].map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {visible.length ? (
          <>
            <section className="library-section-head"><h2>{level === "Semua" ? "Semua Materi" : level === "Interview" ? "Persiapan Interview" : level}</h2></section>
            <section className="library-material-grid">{visible.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title}>
                  <div className="library-material-visual">
                    <small className="library-material-label"><Icon aria-hidden="true" />{item.type}</small>
                    <span aria-hidden="true"><Icon /></span>
                  </div>
                  <div className="library-material-content">
                    <h2>{item.title}</h2>
                    <p>{item.description}</p>
                    <footer>
                      <small>{item.level}</small>
                      {item.href ? (
                        <Link aria-label={`${item.type}: ${item.title}`} href={item.href}>Buka materi</Link>
                      ) : (
                        <button type="button" onClick={() => setLocked(true)} aria-label={`${item.type}: ${item.title}`}>Terkunci</button>
                      )}
                    </footer>
                  </div>
                </article>
              );
            })}</section>
          </>
        ) : (
          <section className="library-empty" style={{ background: "#fff", border: 0, boxShadow: "none" }}>
            <h2>Materi yang kamu cari tidak ada</h2>
            <p>Ubah level, kategori, atau kata kunci untuk menemukan materi yang tersedia.</p>
            <button type="button" onClick={() => { setSearch(""); setLevel("Semua"); setType("Semua"); }}>Reset Filter</button>
          </section>
        )}
        {locked && (
          <div className="library-locked" role="dialog" aria-modal="true" aria-labelledby="library-locked-title">
            <section>
              <p className="dash-kicker">CONTENT LOCKED</p>
              <h2 id="library-locked-title">Materi belum termasuk dalam aksesmu</h2>
              <p>Akses mengikuti level dan paket membership aktif. Progress yang sudah tersimpan tidak hilang.</p>
              <div>
                <Link href={`/renewal?membership=${membership}`}>Lihat Membership</Link>
                <button type="button" onClick={() => setLocked(false)}>Kembali ke Library</button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}



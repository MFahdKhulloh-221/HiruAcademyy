import Link from "next/link";
import { useState } from "react";
import {
  LuArrowRight,
  LuAward,
  LuBell,
  LuCircleCheck,
  LuClipboardCheck,
  LuDumbbell,
  LuFlame,
  LuFlag,
  LuHandshake,
  LuLibrary,
  LuBookOpen,
  LuMessageCircleQuestion,
  LuMessagesSquare,
  LuRotateCcw,
  LuRoute,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import { useAuth } from "@/components/auth-provider";
import { StudentNavigation } from "@/components/student-navigation";
import { getStudentFeatureAccess, type DashboardData, type DashboardIcon } from "@/lib/dashboard-mock";

const glyphs: Record<DashboardIcon | "bell", IconType> = {
  achievement: LuAward,
  affiliate: LuHandshake,
  bell: LuBell,
  certificate: LuCircleCheck,
  checkpoint: LuClipboardCheck,
  community: LuMessagesSquare,
  journey: LuRoute,
  library: LuLibrary,
  practice: LuDumbbell,
  replay: LuRotateCcw,
  sensei: LuMessageCircleQuestion,
  tryout: LuClipboardCheck,
};

function Glyph({ name }: { name: keyof typeof glyphs }) {
  const Icon = glyphs[name];
  return (
    <span className="dash-glyph" aria-hidden="true">
      <Icon />
    </span>
  );
}

export function StudentDashboard({
  data,
  previewEnabled,
}: {
  data: DashboardData;
  previewEnabled: boolean;
}) {
  const { user: currentUser } = useAuth();
  const name = currentUser?.name ?? "";
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] ?? "").join("").toUpperCase();
  const config = data.config;
  const [lockedFeature, setLockedFeature] = useState<string | null>(null);

  return (
    <div className="dashboard-shell student-shell">
      <StudentNavigation membership={data.membership} />
      <div className="dash-main">
        <header className="dash-topbar">
          <div className="dash-top-actions">
            <button type="button" aria-label="Notifikasi">
              <Glyph name="bell" />
            </button>
            <div className="dash-avatar">{initials}</div>
            <div>
              <strong>{name}</strong>
              <span>{data.membershipLabel}</span>
            </div>
          </div>
        </header>

        <main className="dash-content">
          {previewEnabled && (
            <nav className="preview-nav" aria-label="Preview membership">
              <span>Preview visual:</span>
              <Link className={data.membership === "free" ? "selected" : ""} href="/dashboard?membership=free">
                Free
              </Link>
              <Link className={data.membership === "lms" ? "selected" : ""} href="/dashboard?membership=lms">
                LMS
              </Link>
              <Link className={data.membership === "sensei" ? "selected" : ""} href="/dashboard?membership=sensei">
                Sensei
              </Link>
              <small>development only</small>
            </nav>
          )}

          {/* 1. Greeting with Halo name, learning level, target JLPT (membership strictly only under profile/topbar) */}
          <section className="dash-welcome">
            <div>
              <h1>
                Halo, {name} <span aria-hidden="true">👋</span>
              </h1>
              <p className="dash-subgreeting">{config.subgreeting}</p>
            </div>
            <div className="dash-badge-group">
              <span className="dash-badge-target">
                <LuFlag aria-hidden="true" /> {config.target}
              </span>
            </div>
          </section>

          {/* 2. Continue Journey & Progress */}
          <div className="dashboard-bento">
            <div className="dashboard-bento-left">
            <section className="lms-continue sensei-continue">
              <div className="lms-continue-main">
                <p className="dash-kicker">{config.continue.label}</p>
                <h2>{config.continue.title}</h2>
                <p>{config.continue.description}</p>
                <div className="continue-actions continue-actions-centered">
                  <Link className="continue-button" href={config.continue.primaryHref}>
                    {config.continue.primary}{" "}
                    <b aria-hidden="true">
                      <LuArrowRight />
                    </b>
                  </Link>
                </div>
              </div>
            </section>
            <section className="dashboard-material-grid" aria-label="Progres materi">
              <article className="dashboard-material-card"><span className="dashboard-material-icon" aria-hidden="true"><LuRoute /></span><p className="dash-kicker">PROGRES MATERI</p><strong>Level N4</strong><small>Journey aktif</small></article>
              <article className="dashboard-material-card"><span className="dashboard-material-icon" aria-hidden="true"><LuBookOpen /></span><p className="dash-kicker">MODUL SELESAI</p><strong>14 modul</strong><small>Materi telah dipelajari</small></article>
            </section>
            </div>

            <section className="dash-progress-card">
              <p className="dash-kicker">{config.continue.progressLabel}</p>
              <div className="dash-progress-ring">
                <svg viewBox="0 0 36 36" className="dash-ring-svg">
                  <path
                    className="dash-ring-bg"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="dash-ring-fill"
                    strokeDasharray={`${config.continue.progressPercent}, 100`}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="dash-ring-value">
                  <strong>{config.continue.progress}</strong>
                </div>
              </div>
            </section>

            <section className="dash-leaderboard-section dashboard-bento-leaderboard">
              <div className="dash-leaderboard-head">
                <div>
                  <p className="dash-kicker">KOMPETISI</p>
                  <h2>Papan Peringkat</h2>
                </div>
                <Link className="dash-leaderboard-all" href={`/leaderboard?membership=${data.membership}`}>
                  Lihat Semua <LuArrowRight aria-hidden="true" />
                </Link>
              </div>
              <ul className="dash-leaderboard-list">
                {config.leaderboard.map((user) => (
                  <li key={user.rank} className={`dash-leaderboard-item${user.isCurrentUser ? " current-user" : ""}`}>
                    <span className={`dash-rank-badge rank-${user.rank}`}>{user.rank}</span>
                    <div className="dash-leaderboard-info"><strong>{user.isCurrentUser ? `${name} (Kamu)` : user.name}</strong><small>{user.rank === 1 ? "12.450 XP" : user.rank === 2 ? "10.820 XP" : user.rank === 3 ? "9.640 XP" : user.rank === 4 ? "8.930 XP" : "8.410 XP"}</small></div>
                    {user.rank === 1 && <span className="dash-rank-fire" aria-hidden="true"><LuFlame /></span>}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* 3. Akses Cepat */}
          <section className="lms-section-head dashboard-quick-heading">
            <h2>Menu cepat</h2>
          </section>
          <section className="lms-quick-grid" aria-label="Akses cepat">
            {config.quickActions.map((action) => {
              const locked = getStudentFeatureAccess(data.membership, action.feature) === "locked";
              const content = <><Glyph name={action.icon} /><span><strong>{action.title}</strong><small>{action.detail}</small></span></>;
              return locked ? <button type="button" className="dashboard-quick-locked" key={action.title} aria-label={`${action.title}, akses terkunci`} onClick={() => setLockedFeature(action.title)}>{content}</button> : <Link href={action.href} key={action.title}>{content}</Link>;
            })}
          </section>
          {lockedFeature && <div className="locked-modal"><button className="locked-modal-backdrop" type="button" aria-label="Tutup" onClick={() => setLockedFeature(null)} /><section role="dialog" aria-modal="true" aria-labelledby="dashboard-locked-title"><button className="locked-modal-close" type="button" aria-label="Tutup" onClick={() => setLockedFeature(null)}>×</button><p>{lockedFeature}</p><h2 id="dashboard-locked-title">Akses Terkunci</h2><p>Fitur ini belum termasuk dalam membershipmu.</p><div className="locked-modal-actions"><button type="button" onClick={() => setLockedFeature(null)}>Tutup</button><Link href={`/#program`}>Upgrade</Link></div></section></div>}

        </main>
      </div>
    </div>
  );
}

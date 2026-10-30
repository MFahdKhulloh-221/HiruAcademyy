import Link from "next/link";
import practiceStyles from "./dashboard-practice.module.css";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useCallback, useState, type ReactNode } from "react";
import { useLearningRequest } from "@/components/learning-hooks";
import { LeaderboardRows, LeaderboardRules } from "@/components/student-leaderboard-screen";
import { studentGamification, studentLeaderboard } from "@/lib/learning-api";
import {
  LuArrowRight,
  LuAward,
  LuBell,
  LuCircleCheck,
  LuClipboardCheck,
  LuDumbbell,
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
import { StudentHeaderActions } from "@/components/student-header-actions";
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
  practiceRecommendations,
}: {
  data: DashboardData;
  previewEnabled: boolean;
  practiceRecommendations?: ReactNode;
}) {
  const { user: currentUser } = useAuth();
  const name = currentUser?.name ?? "";
  const config = data.config;
  const loadLeaderboard = useCallback((signal: AbortSignal) => studentLeaderboard("all", signal), []);
  const leaderboard = useLearningRequest(loadLeaderboard, "dashboard-leaderboard");
  const gamification = useLearningRequest(studentGamification, "dashboard-gamification");
  const [lockedFeature, setLockedFeature] = useState<string | null>(null);

  return (
    <div className="dashboard-shell student-shell">
      <StudentNavigation membership={data.membership} />
      <div className="dash-main">
        <header className="dash-topbar">
          <StudentHeaderActions membership={data.membership} />
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
            <div className={`dashboard-bento-left${practiceRecommendations ? ` ${practiceStyles.card}` : ""}`}>
            <section className="lms-continue sensei-continue">
              <div className="lms-continue-main">
                <p className="dash-kicker">{config.continue.label}</p>
                <h2>{config.continue.title}</h2>
                <p>{config.continue.description}</p>
                <div className={practiceRecommendations ? "continue-actions" : "continue-actions continue-actions-centered"}>
                  <Link className="continue-button" href={config.continue.primaryHref}>
                    {config.continue.primary}{" "}
                    <b aria-hidden="true">
                      <LuArrowRight />
                    </b>
                  </Link>
                </div>
              </div>
            </section>
            {practiceRecommendations}
            <section className="dashboard-material-grid" aria-label="Progres materi">
              <article className="dashboard-material-card"><span className="dashboard-material-icon" aria-hidden="true"><LuRoute /></span><p className="dash-kicker">PROGRES MATERI</p><strong>{config.level}</strong><small>Journey aktif</small></article>
              <article className="dashboard-material-card"><span className="dashboard-material-icon" aria-hidden="true"><LuBookOpen /></span><p className="dash-kicker">MODUL SELESAI</p><strong>{config.continue.detail}</strong><small>Materi telah dipelajari</small></article>
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
              {!gamification.data && !gamification.error && <LoadingSkeleton variant="stats" rows={1} label="Memuat progres…" />}
              {gamification.error && <p role="alert">{gamification.error} <button type="button" className="button button-secondary" onClick={gamification.retry}>Coba Lagi</button></p>}
              {gamification.data && <div className="gamification-metrics"><span><strong>{gamification.data.weekly_xp.toLocaleString("id-ID")} XP</strong>XP Mingguan</span><span><strong>{gamification.data.streak_days}</strong>Hari Streak</span></div>}
            </section>

            <section className="dash-leaderboard-section dashboard-bento-leaderboard">
              <div className="dash-leaderboard-head">
                <div>
                  <p className="dash-kicker">KOMPETISI</p>
                  <div className="leaderboard-title"><h2>Papan Peringkat</h2><LeaderboardRules /></div>
                </div>
                <Link className="dash-leaderboard-all" href={`/leaderboard?membership=${data.membership}`}>
                  Lihat Semua <LuArrowRight aria-hidden="true" />
                </Link>
              </div>
              {!leaderboard.data && !leaderboard.error && <LoadingSkeleton variant="ranking" rows={5} label="Memuat leaderboard…" />}
              {leaderboard.error && <p role="alert">{leaderboard.error} <button type="button" className="button button-secondary" onClick={leaderboard.retry}>Coba Lagi</button></p>}
              {leaderboard.data && <>{leaderboard.data.entries.length === 0 && <p role="status">Belum ada data untuk ditampilkan.</p>}<LeaderboardRows entries={leaderboard.data.entries.filter(row => row.rank <= 5)} /></>}
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
          {lockedFeature && <div className="locked-modal"><button className="locked-modal-backdrop" type="button" aria-label="Tutup" onClick={() => setLockedFeature(null)} /><section role="dialog" aria-modal="true" aria-labelledby="dashboard-locked-title"><button className="locked-modal-close" type="button" aria-label="Tutup" onClick={() => setLockedFeature(null)}>×</button><p>{lockedFeature}</p><h2 id="dashboard-locked-title">Akses Terkunci</h2><p>Fitur ini belum termasuk dalam membershipmu.</p><div className="locked-modal-actions"><button type="button" onClick={() => setLockedFeature(null)}>Tutup</button><Link href="/membership">Upgrade</Link></div></section></div>}

        </main>
      </div>
    </div>
  );
}

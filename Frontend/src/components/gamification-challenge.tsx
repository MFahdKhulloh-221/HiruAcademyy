import { LuAward } from "react-icons/lu";
import type { StudentGamificationData } from "@/lib/learning-api";

const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

export function GamificationChallenge({ challenge }: { challenge: StudentGamificationData["challenge"] }) {
  const status = challenge.status === "achieved" ? "Selesai" : challenge.status === "expired" ? "Berakhir" : "Aktif";
  return <div className="challenge-summary">
    <header className="challenge-heading"><h2>Tantangan 7 Hari Pertama</h2><span className={`challenge-status challenge-status-${challenge.status}`}>{status}</span></header>
    <p className="challenge-period"><time dateTime={challenge.starts_on}>{dateFormat.format(new Date(`${challenge.starts_on}T00:00:00+07:00`))}</time> – <time dateTime={challenge.ends_on}>{dateFormat.format(new Date(`${challenge.ends_on}T00:00:00+07:00`))}</time></p>
    <p className="challenge-count"><strong>{challenge.active_days} dari {challenge.target_days} hari aktif</strong><span>Periode {challenge.total_days} hari</span></p>
    <progress aria-label="Tantangan 7 Hari Pertama" value={challenge.active_days} max={challenge.target_days} />
    <p className="challenge-hint">{challenge.status === "achieved" ? "Target tercapai. Pertahankan kebiasaan belajarmu!" : challenge.status === "expired" ? "Periode tantangan selesai. Tetap lanjutkan belajarmu!" : `Belajar di ${Math.max(0, challenge.target_days - challenge.active_days)} hari lagi untuk mencapai target.`}</p>
    {challenge.badge && <span className="progress-streak-badge"><LuAward aria-hidden="true" />{challenge.badge}</span>}
  </div>;
}

import type { Achievement } from "@/lib/program-achievement-api";
import styles from "@/components/digital-achievement-card.module.css";

const learningTypes = { free: "Free", lms: "Mandiri", sensei: "Sensei" };
const issuedDate = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" });

export function DigitalAchievementCard({ achievement }: { achievement: Achievement }) {
  const presentation = achievement.presentation_snapshot;
  const date = achievement.issued_at ? new Date(achievement.issued_at) : null;
  return <article className={styles.card} aria-label="Achievement digital">
    <p className={styles.brand}>HiruAcademy <span>ACHIEVEMENT</span></p>
    <h2>{presentation.title}</h2>
    {presentation.description && <p>{presentation.description}</p>}
    <dl>
      <div><dt>Nama siswa</dt><dd>{achievement.student_name_snapshot}</dd></div>
      <div><dt>Program</dt><dd>{achievement.program_name_snapshot}</dd></div>
      <div><dt>Kode program</dt><dd>{achievement.program_code_snapshot}</dd></div>
      <div><dt>Jenis pembelajaran</dt><dd>{learningTypes[achievement.learning_type_snapshot] ?? "Tidak tersedia"}</dd></div>
      <div><dt>Tanggal terbit</dt><dd>{date && Number.isFinite(date.getTime()) ? <time dateTime={achievement.issued_at!}>{issuedDate.format(date)}</time> : "Tidak tersedia"}</dd></div>
      {presentation.issuer && <div><dt>Penerbit</dt><dd>{presentation.issuer}</dd></div>}
    </dl>
  </article>;
}

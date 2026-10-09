import styles from "./loading-skeleton.module.css";

export type LoadingSkeletonProps = {
  variant?: "dashboard" | "cards" | "list" | "table" | "learning" | "assessment" | "profile" | "form" | "article" | "ranking" | "stats";
  rows?: number;
  label?: string;
  className?: string;
};

export function LoadingSkeleton({ variant = "cards", rows = 3, label = "Memuat...", className }: LoadingSkeletonProps) {
  const count = Number.isFinite(rows) ? Math.max(1, Math.min(20, Math.floor(rows))) : 3;
  return (
    <div className={[styles.root, className].filter(Boolean).join(" ")} role="status" aria-busy="true">
      <span className={styles.label}>{label}</span>
      <div className={`${styles.shapes} ${styles[variant]}`} aria-hidden="true">
        <div className={styles.heading}><span /><span /></div>
        <div className={styles.body}>
          {Array.from({ length: count }, (_, index) => (
            <div className={styles.item} key={index}>
              <span className={styles.media} />
              <div className={styles.lines}><span /><span /><span /></div>
              <span className={styles.detail} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StudentLoading({ active = true, shell = "dashboard", ...props }: LoadingSkeletonProps & { active?: boolean; shell?: "dashboard" | "journey" | "learning" | "supporting" | "sensei" | "admin" }) {
  if (!active) return null;
  const contentClass = shell === "supporting" ? "supporting-main" : shell === "admin" ? "admin-page" : shell === "dashboard" ? "dash-content" : `${shell}-content`;
  return (
    <div className={`${styles.shell} ${shell === "admin" ? styles.adminShell : ""}`}>
      <div className={`${styles.sidebar} ${styles.shapes}`} aria-hidden="true">
        <span className={styles.brand} />
        <div className={styles.nav}>{Array.from({ length: 8 }, (_, index) => <span key={index} />)}</div>
        <div className={styles.footer}><span /><span /></div>
      </div>
      <div className={styles.main}>
        {shell !== "supporting" && <div className={`${styles.topbar} ${styles.shapes} ${shell === "dashboard" ? styles.dashboardTopbar : ""}`} aria-hidden="true"><span /><div><span /><span /></div></div>}
        <span className={`${styles.mobileTrigger} ${styles.shapes}`} aria-hidden="true" />
        <main className={`${contentClass} ${styles.content}`}><LoadingSkeleton {...props} /></main>
      </div>
    </div>
  );
}

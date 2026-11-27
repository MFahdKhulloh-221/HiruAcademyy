import { LuAward, LuBookOpen, LuCalendar, LuMegaphone, LuUser } from "react-icons/lu";

export function notificationCategory(type: string) {
  switch (type) {
    case "Belajar":
    case "Pembelajaran": return { label: "Pembelajaran", Icon: LuBookOpen, tone: "learning" };
    case "Kelas": return { label: "Kelas", Icon: LuCalendar, tone: "class" };
    case "Achievement":
    case "Pencapaian": return { label: "Pencapaian", Icon: LuAward, tone: "achievement" };
    case "Akun": return { label: "Akun", Icon: LuUser, tone: "account" };
    default: return { label: "Pengumuman", Icon: LuMegaphone, tone: "announcement" };
  }
}

const timezone = "Asia/Jakarta";
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
const dateFormatter = new Intl.DateTimeFormat("id-ID", { timeZone: timezone, day: "numeric", month: "long", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("id-ID", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });

export function notificationDay(value: string | null, now = new Date()) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return { key: "unknown", label: "Lainnya" };
  const key = dayFormatter.format(date);
  const today = dayFormatter.format(now);
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const label = key === today ? "Hari ini" : key === yesterday.toISOString().slice(0, 10) ? "Kemarin" : dateFormatter.format(date);
  return { key, label };
}

export function notificationTime(value: string | null, now = new Date()) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "";
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes >= 0 && minutes < 1) return "Baru saja";
  if (minutes >= 1 && minutes < 60) return `${minutes} menit lalu`;
  if (minutes >= 60 && minutes < 24 * 60) return `${Math.floor(minutes / 60)} jam lalu`;
  if (notificationDay(value, now).label === "Hari ini") return `Hari ini, ${timeFormatter.format(date)} WIB`;
  if (notificationDay(value, now).label === "Kemarin") return `Kemarin, ${timeFormatter.format(date)} WIB`;
  return `${dateFormatter.format(date)}, ${timeFormatter.format(date)} WIB`;
}

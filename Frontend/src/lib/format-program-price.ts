export function formatProgramPrice(value: number | null | undefined): string {
  if (value == null || !Number.isSafeInteger(value) || value < 0) return "Belum tersedia";
  if (value === 0) return "Gratis";
  const divisor = value >= 1_000_000 ? 1_000_000 : value >= 1_000 ? 1_000 : 1;
  return `Rp${new Intl.NumberFormat("id-ID", { maximumFractionDigits: divisor === 1_000_000 ? 6 : 3 }).format(value / divisor)}${divisor === 1_000_000 ? "JT" : divisor === 1_000 ? "K" : ""}`;
}

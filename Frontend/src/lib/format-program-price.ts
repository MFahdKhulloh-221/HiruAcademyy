export function formatProgramPrice(value: number | null | undefined): string {
  if (value == null || !Number.isSafeInteger(value) || value < 0) return "Belum tersedia";
  if (value === 0) return "Gratis";
  const divisor = value >= 1_000_000 ? 1_000_000 : value >= 1_000 ? 1_000 : 1;
  const decimals = divisor === 1_000_000 ? 2 : 1;
  if (divisor > 1 && value % (divisor / 10 ** decimals) === 0) {
    return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: decimals }).format(value / divisor)}${divisor === 1_000_000 ? "JT" : "K"}`;
  }
  return `Rp${new Intl.NumberFormat("id-ID").format(value)}`;
}

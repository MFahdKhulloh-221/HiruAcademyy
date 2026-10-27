import { formatProgramPrice } from "@/lib/format-program-price";

export function ProgramPriceDisplay({ price, normalPrice, months, discountPercent, minimum = false }: { price: number | null; normalPrice?: number | null; months: number | string; discountPercent?: number; minimum?: boolean }) {
  const discounted = price != null && normalPrice != null && Number.isSafeInteger(price) && Number.isSafeInteger(normalPrice) && price >= 0 && price < normalPrice;
  const validPercent = discounted && discountPercent != null && Number.isFinite(discountPercent) && discountPercent > 0 && discountPercent <= 100 && normalPrice - Math.round(normalPrice * discountPercent / 100) === price;
  return <div className="pricing-price-box">
    {discounted && <div className="pricing-discount-row"><s>{formatProgramPrice(normalPrice)}</s><span>{validPercent ? `Diskon ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(discountPercent)}%` : `Hemat ${formatProgramPrice(normalPrice - price)}`}</span></div>}
    {minimum && price != null && price > 0 && <span className="pricing-minimum">Mulai dari</span>}
    <span className="pricing-amount">{formatProgramPrice(price)}</span>
    {price != null && price > 0 && <span className="pricing-period">/{months} bulan</span>}
  </div>;
}

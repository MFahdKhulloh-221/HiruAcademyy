import { formatProgramPrice } from "@/lib/format-program-price";

export function ProgramPriceDisplay({ price, normalPrice, months }: { price: number | null; normalPrice?: number | null; months: number | string }) {
  const discounted = price != null && normalPrice != null && price < normalPrice;
  return <div className="pricing-price-box">
    {discounted && <div className="pricing-discount-row"><s>{formatProgramPrice(normalPrice)}</s><span>Hemat {formatProgramPrice(normalPrice - price)}</span></div>}
    <span className="pricing-amount">{formatProgramPrice(price)}</span>
    {price != null && price > 0 && <span className="pricing-period">/{months} bulan</span>}
  </div>;
}

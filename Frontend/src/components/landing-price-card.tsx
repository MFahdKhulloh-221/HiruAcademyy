import Link from "next/link";
import type { CSSProperties } from "react";
import type { landingOffers } from "@/lib/landing-offers";
import { ProgramPriceDisplay } from "@/components/program-price-display";

export function LandingPriceCard({ offer, price, normalPrice, months, discountPercent, preview = false, priceText, unavailable = false, index = 0, onSelect, selected = false }: {
  offer: (typeof landingOffers)[number]; price: number | null; normalPrice?: number | null; discountPercent?: number; months: number | string; preview?: boolean; priceText?: string; promotion?: { starts_at: string | null; ends_at: string | null } | null; unavailable?: boolean; index?: number; onSelect?: () => void; selected?: boolean;
}) {
  return <article className={`pricing-card landing-price-card${preview || onSelect ? "" : " reveal-item"}${offer.popular ? " pricing-card-popular" : ""}${selected ? " selected-pricing-card" : ""}`} style={{ "--reveal-index": index } as CSSProperties}>
    {offer.popular && <div className="pricing-floating-badge" aria-label="Paket paling populer">Paling Populer</div>}
    <div className="pricing-card-header">
      {offer.badge && <span className="pricing-badge-pill">{offer.badge}</span>}
      <h3 className="pricing-title">{offer.title}</h3>
      {offer.subTitle && <span className="pricing-subtitle">{offer.subTitle}</span>}
      <p className="pricing-desc">{offer.description}</p>
    </div>
    {priceText ? <div className="pricing-price-box">{priceText}</div> : <ProgramPriceDisplay price={price} normalPrice={normalPrice} months={months} discountPercent={discountPercent} minimum />}
    <ul className="pricing-features" aria-label={`Fitur paket ${offer.title}`}>
      {offer.points.map(point => <li key={point}><span className="feature-check" aria-hidden="true"><svg width="14" height="14" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg></span><span>{point}</span></li>)}
    </ul>
    <div className="pricing-card-footer">
      {unavailable ? <p role="status">Paket belum tersedia.</p> : onSelect ? <button type="button" className="button button-primary pricing-cta-btn" aria-pressed={selected} onClick={onSelect}>{offer.cta}</button> : preview ? <button type="button" className="button button-primary pricing-cta-btn" aria-disabled="true">{offer.cta}</button> : <Link className="button button-primary pricing-cta-btn" href={offer.href}>{offer.cta}</Link>}
    </div>
  </article>;
}

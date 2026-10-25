import { ProgramPriceDisplay } from "@/components/program-price-display";

export function ProgramPriceCardContent({ title, description, price, normalPrice, months }: { title: string; description: string; price: number | null; normalPrice?: number | null; months: number | string }) {
  return <><div className="pricing-card-header"><h3 className="pricing-title">{title}</h3><p className="pricing-desc">{description}</p></div><ProgramPriceDisplay price={price} normalPrice={normalPrice} months={months} /></>;
}

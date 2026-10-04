"use client";

import Image from "next/image";
import { useState } from "react";
import { contentMedia, useContent, type SenseiContent } from "@/lib/public-content-api";

export function SenseiGrid({ limit, reveal = false, carousel = false }: { limit?: number; reveal?: boolean; carousel?: boolean }) {
  const content = useContent<SenseiContent>("/api/sensei-profiles");
  const profiles = limit ? content.data.slice(0, limit) : content.data;
  const [activeIndex, setActiveIndex] = useState(0);
  const currentIndex = profiles.length ? activeIndex % profiles.length : 0;
  const move = (direction: number) => profiles.length > 1 && setActiveIndex((current) => (current + direction + profiles.length) % profiles.length);

  const cards = profiles.map((sensei, index) => {
    const distance = ((index - currentIndex + profiles.length + Math.floor(profiles.length / 2)) % profiles.length) - Math.floor(profiles.length / 2);
    return (
      <article
        aria-hidden={carousel && Math.abs(distance) > 1}
        className={`sensei-card${reveal ? " reveal-item" : ""}${carousel ? ` sensei-carousel-card sensei-carousel-card-${distance === 0 ? "active" : Math.abs(distance) === 1 ? "side" : "hidden"}` : ""}`}
        key={sensei.id}
        style={carousel ? ({ "--sensei-position": distance } as React.CSSProperties) : reveal ? ({ "--reveal-index": index } as React.CSSProperties) : undefined}
      >
        <div className="sensei-avatar" aria-label={`Foto ${sensei.name}`}>
          {contentMedia(sensei.photo) ? <Image unoptimized src={contentMedia(sensei.photo)} alt={`Foto profil ${sensei.name}`} fill sizes="(max-width: 768px) 76vw, 270px" className="sensei-avatar-img" /> : <span>{sensei.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>}
        </div>
        <div className="sensei-card-body">
          <h3>{sensei.name}</h3>
          <p>{sensei.role}</p>
          <ul aria-label={`Fokus pembelajaran ${sensei.name}`}>
            {sensei.expertise.slice(0, carousel ? 3 : undefined).map((expertise) => <li key={expertise}>{expertise}</li>)}
          </ul>
        </div>
      </article>
    );
  });

  if (content.loading) return <p role="status">Memuat profil Sensei…</p>;
  if (content.error) return <div role="alert">{content.error} <button type="button" onClick={content.reload}>Coba lagi</button></div>;
  if (!profiles.length) return <p className="sensei-empty">Belum ada profil Sensei aktif.</p>;
  if (!carousel) return <div className="sensei-grid">{cards}</div>;

  return (
    <div className="sensei-carousel" aria-roledescription="carousel" aria-label="Sensei Hiru Academy">
      <button className="sensei-carousel-arrow sensei-carousel-prev" type="button" aria-label="Sensei sebelumnya" onClick={() => move(-1)}>&lt;</button>
      <div className="sensei-carousel-viewport" aria-live="polite">{cards}</div>
      <button className="sensei-carousel-arrow sensei-carousel-next" type="button" aria-label="Sensei berikutnya" onClick={() => move(1)}>&gt;</button>
    </div>
  );
}

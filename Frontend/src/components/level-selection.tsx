"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LuArrowRight, LuLock, LuFlag, LuUsers } from "react-icons/lu";
import type { JourneyLevel } from "@/lib/journey-mock";
import type { Membership } from "@/lib/dashboard-mock";

export function LevelSelection({ membership, levels }: { membership: Membership; levels: JourneyLevel[] }) {
  const [selected, setSelected] = useState<JourneyLevel | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function closeDialog() {
    setSelected(null);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  useEffect(() => {
    if (!selected) return;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape") closeDialog(); }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  return (
    <>
      <section className="level-grid" aria-label="Pilihan level">
        {levels.map((level) => {
          const isLocked = level.access === "notPurchased";
          return (
            <article className={`level-card level-${level.progression} ${isLocked ? "is-locked" : ""}`} key={level.slug}>
              {isLocked && (
                <div className="level-card-lock-overlay" aria-hidden="true">
                  <div className="level-card-lock-icon">
                    <LuLock />
                  </div>
                </div>
              )}
              <div className="level-card-top">
                <span className="level-code">
                  {level.slug === "dasar" ? (
                    <LuFlag aria-hidden="true" />
                  ) : level.slug === "interview" ? (
                    <LuUsers aria-hidden="true" />
                  ) : (
                    level.code
                  )}
                </span>
                <span className="level-status">
                  {isLocked && <LuLock aria-hidden="true" style={{ display: "inline-block", marginRight: "4px", verticalAlign: "middle" }} />}
                  {level.statusLabel}
                </span>
              </div>
              <h2>{level.title}</h2>
              <p>{level.description}</p>
              {level.access === "notPurchased" ? (
                <Link className="level-unavailable" href={`/renewal?membership=${membership}&target=${level.code.toLowerCase()}`}>
                  {level.code === "SSW" || level.code === "INTERVIEW" ? level.actionLabel : `Upgrade ke JLPT ${level.code}`}
                  <LuArrowRight aria-hidden="true" style={{ display: "inline-block", marginLeft: "4px", verticalAlign: "middle" }} />
                </Link>
              ) : (
                <Link href={`/journey/${level.slug}?membership=${membership}`}>
                  {level.actionLabel}
                  <LuArrowRight aria-hidden="true" style={{ display: "inline-block", marginLeft: "4px", verticalAlign: "middle" }} />
                </Link>
              )}
            </article>
          );
        })}
      </section>


    </>
  );
}

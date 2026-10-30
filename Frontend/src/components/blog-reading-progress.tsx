"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function BlogReadingProgress() {
  const [progress, setProgress] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const body = document.querySelector<HTMLElement>(".editorial-body");
    const header = document.querySelector<HTMLElement>(".public-header");
    if (!body) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const top = header?.getBoundingClientRect().bottom ?? 0;
      const rect = body.getBoundingClientRect();
      // Track body crossing the reading line, not page/footer scrolling.
      const line = top + (window.innerHeight - top) * 0.5;
      const value = rect.top >= line ? 0 : rect.bottom <= line ? 100 : Math.round((line - rect.top) / rect.height * 100);
      setOffset(top);
      setProgress(value);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(body);
    if (header) observer.observe(header);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return <section className="editorial-progress-panel"><h2>Progress membaca</h2>{progress === null ? <p>Aktif setelah JavaScript tersedia.</p> : <><div className="editorial-progress-value"><progress aria-label="Progress membaca" value={progress} max={100} /><span>{progress}%</span></div>{createPortal(<div className="editorial-reading-rail" style={{ top: offset }} aria-hidden="true"><span style={{ transform: `scaleX(${progress / 100})` }} /></div>, document.body)}</>}</section>;
}

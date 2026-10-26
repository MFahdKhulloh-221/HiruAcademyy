"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./testimoni.module.css";

export function ScrollList({ children, className, label }: { children: ReactNode; className: string; label: string }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    function measure() {
      if (!element) return;
      const cards = Array.from(element.children).filter(child => child.tagName !== "DIALOG");
      const rows = [...new Set(cards.map(card => (card as HTMLElement).offsetTop))].sort((a, b) => a - b);
      if (rows.length <= 7) {
        element.style.maxHeight = "none";
        return;
      }
      const end = Math.max(...cards.filter(card => (card as HTMLElement).offsetTop <= rows[6]).map(card => (card as HTMLElement).offsetTop + (card as HTMLElement).offsetHeight));
      element.style.maxHeight = `${end + 8}px`;
    }
    const observer = new ResizeObserver(measure);
    const observe = () => {
      observer.disconnect();
      observer.observe(element);
      Array.from(element.children).forEach(child => observer.observe(child));
      measure();
    };
    const mutation = new MutationObserver(observe);
    mutation.observe(element, { childList: true });
    observe();
    return () => { observer.disconnect(); mutation.disconnect(); };
  }, []);
  return <div ref={list} className={`${className} ${styles.scrollList}`} tabIndex={0} role="region" aria-label={label}>{children}</div>;
}

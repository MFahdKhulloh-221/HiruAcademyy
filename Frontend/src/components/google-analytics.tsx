"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { commercialData } from "@/lib/commercial-api";
import styles from "./google-analytics.module.css";

const consentKey = "hiru.analytics-consent.v1";
// ponytail: public marketing pages only; add routes after reviewing URL and content privacy.
const publicPage = /^(?:\/(?:blog(?:\/[a-z0-9-]+)?|program(?:\/[a-z0-9-]+)?|sensei|testimoni|kebijakan-privasi)?)\/?$/i;
// Campaign tokens only: never forward arbitrary query values, contact details, or free text.
const campaignKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_id", "utm_content", "utm_term", "gclid", "dclid", "gbraid", "wbraid"];
function publicLocation() {
  const url = new URL(window.location.href);
  const query = new URLSearchParams();
  for (const key of campaignKeys) {
    const values = url.searchParams.getAll(key);
    const value = values[0];
    if (values.length === 1 && value && /^[a-z0-9_-]{1,100}$/i.test(value) && !/\d{7,}/.test(value)) query.set(key, value);
  }
  return `${url.origin}${url.pathname}${query.size ? `?${query}` : ""}`;
}
function externalReferrer() {
  try {
    const url = new URL(document.referrer);
    return ["https:", "http:"].includes(url.protocol) && url.origin !== window.location.origin ? url.origin : "";
  } catch { return ""; }
}
type Consent = "granted" | "denied";
type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; [key: `ga-disable-${string}`]: boolean | undefined };

export function GoogleAnalytics() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [measurementId, setMeasurementId] = useState<string | null>(null);
  const [consent, setConsent] = useState<Consent | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const initialized = useRef<string | null>(null);
  const lastPage = useRef<string | null>(null);
  const eligible = !!pathname && publicPage.test(pathname) && !loading && user?.role !== "admin";

  useEffect(() => {
    const controller = new AbortController();
    void commercialData<{ measurementId: unknown }>("/api/public/analytics-config", controller.signal)
      .then(data => { if (!controller.signal.aborted && typeof data.measurementId === "string" && /^G-[A-Z0-9]+$/i.test(data.measurementId)) setMeasurementId(data.measurementId.toUpperCase()); })
      .catch(() => { /* Fail closed: unavailable configuration must not enable tracking. */ });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    function sync() {
      try {
        const value = localStorage.getItem(consentKey);
        setConsent(value === "granted" || value === "denied" ? value : null);
      } catch { setConsent(null); }
    }
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  // Block loaded tag before browser events on excluded routes; script removal alone cannot unload GA.
  useLayoutEffect(() => {
    if (!measurementId) return;
    const analytics = window as unknown as AnalyticsWindow;
    const enabled = eligible && consent === "granted";
    analytics[`ga-disable-${measurementId}`] = !enabled;
    if (!enabled) {
      // Do not issue consent updates on private routes: loaded tags can send consent pings.
      lastPage.current = null;
      return;
    }
    analytics.dataLayer ??= [];
    // Google tag consumes Arguments objects, not arrays.
    // eslint-disable-next-line prefer-rest-params
    analytics.gtag ??= function () { analytics.dataLayer!.push(arguments); };
    const gtag = analytics.gtag;
    const location = publicLocation();
    const referrer = externalReferrer();
    if (initialized.current !== measurementId) {
      gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      gtag("js", new Date());
      gtag("config", measurementId, {
        send_page_view: false,
        page_location: location,
        page_referrer: referrer,
        page_title: "HIRU Academy",
        // Manual events only; enhanced measurement must also be OFF in GA4 stream settings.
        allow_enhanced_conversions: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      });
      const script = document.createElement("script");
      script.id = "hiru-google-analytics";
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
      document.head.appendChild(script);
      initialized.current = measurementId;
    }
    gtag("consent", "update", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    if (lastPage.current !== location) {
      gtag("set", { page_location: location, page_referrer: referrer, page_title: "HIRU Academy" });
      gtag("event", "page_view", { send_to: measurementId, page_location: location, page_referrer: referrer, page_title: "HIRU Academy" });
      lastPage.current = location;
    }
    const send = (name: string, params: Record<string, string | number | boolean> = {}) => {
      if (analytics[`ga-disable-${measurementId}`] || !publicPage.test(window.location.pathname)) return;
      gtag("event", name, { send_to: measurementId, page_location: location, page_referrer: referrer, page_title: "HIRU Academy", ...params });
    };
    let scrolled = false;
    function scroll() {
      const height = document.documentElement.scrollHeight - window.innerHeight;
      if (!scrolled && height > 0 && window.scrollY / height >= 0.9) {
        scrolled = true;
        send("scroll", { percent_scrolled: 90 });
      }
    }
    function click(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const video = event.target.closest<HTMLButtonElement>("button[data-analytics-video-provider]");
      const provider = video?.dataset.analyticsVideoProvider;
      // Iframes expose no playback events: report opening only, never claim a video started.
      if (provider && ["youtube", "drive"].includes(provider)) send("video_open", { video_provider: provider });
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link) return;
      const url = new URL(link.href, window.location.href);
      if (!["https:", "http:"].includes(url.protocol)) return;
      const extension = /\.(pdf|zip|docx?|xlsx?|pptx?|mp3|mp4)$/i.exec(url.pathname)?.[1]?.toLowerCase();
      // No URLs, filenames, link text, phone numbers or signed storage tokens leave browser.
      if (link.hasAttribute("download") || extension) send("file_download", { file_extension: extension ?? "unknown" });
      else if (url.origin !== window.location.origin) send("click", { outbound: true });
    }
    const started = new WeakSet<HTMLVideoElement>();
    const completed = new WeakSet<HTMLVideoElement>();
    function video(event: Event) {
      if (!(event.target instanceof HTMLVideoElement)) return;
      const seen = event.type === "playing" ? started : completed;
      if (seen.has(event.target)) return;
      seen.add(event.target);
      send(event.type === "playing" ? "video_start" : "video_complete", { video_provider: "html5" });
    }
    window.addEventListener("scroll", scroll, { passive: true });
    document.addEventListener("click", click);
    document.addEventListener("playing", video, true);
    document.addEventListener("ended", video, true);
    return () => {
      analytics[`ga-disable-${measurementId}`] = true;
      window.removeEventListener("scroll", scroll);
      document.removeEventListener("click", click);
      document.removeEventListener("playing", video, true);
      document.removeEventListener("ended", video, true);
    };
  }, [consent, eligible, measurementId, pathname]);

  function choose(value: Consent) {
    try { localStorage.setItem(consentKey, value); } catch { /* Choice still applies for this page session. */ }
    setConsent(value);
    setPreferencesOpen(false);
    if (value === "denied" && initialized.current) {
      const analytics = window as unknown as AnalyticsWindow;
      analytics[`ga-disable-${initialized.current}`] = true;
      analytics.gtag?.("consent", "update", { analytics_storage: "denied" });
      for (const cookie of document.cookie.split(";")) {
        const name = cookie.split("=")[0].trim();
        if (!/^_ga(?:_|$)/.test(name)) continue;
        document.cookie = `${name}=; Max-Age=0; path=/`;
        const parts = window.location.hostname.split(".");
        for (let i = 0; i < parts.length - 1; i++) document.cookie = `${name}=; Max-Age=0; path=/; domain=.${parts.slice(i).join(".")}`;
      }
      window.location.reload();
    }
  }

  if (!eligible || !measurementId) return null;
  if (consent && !preferencesOpen) return <button type="button" className={styles.preferences} onClick={() => setPreferencesOpen(true)}>Preferensi analitik</button>;
  return <section className={styles.banner} aria-label="Persetujuan analitik">
    <div><strong>Izinkan analitik kunjungan?</strong><p>Google Analytics membantu memahami penggunaan halaman publik. Pelacakan baru aktif setelah Anda mengizinkan. Pilihan dapat diubah lewat Preferensi analitik. <Link href="/kebijakan-privasi">Kebijakan privasi</Link>.</p></div>
    <div className={styles.actions}><button type="button" onClick={() => choose("denied")}>Tolak analitik</button><button type="button" onClick={() => choose("granted")}>Izinkan analitik</button></div>
  </section>;
}

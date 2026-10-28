"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { apiRequest, ApiError } from "@/lib/api";
import { AttemptPersistence, readAttempt, startAttempt, type AttemptDomain, type ServerAttempt } from "@/lib/assessment-attempt";

export function useAssessmentAttempt(path: string, domain: AttemptDomain, scope?: string, resumeAudio = false) {
  const { user, loading } = useAuth();
  const identity = loading ? undefined : domain === "placement" ? `placement:${user?.id ?? "guest"}` : user?.id;
  const persistence = useRef<AttemptPersistence | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const latestAnswers = useRef<Record<string, string>>({});
  const saveVersion = useRef(0);
  // ponytail: tab-session reference only; cross-device resume needs backend attempt discovery.
  const resumeKey = resumeAudio && identity ? `audio-attempt:${identity}:${path}` : undefined;
  const requestKey = JSON.stringify([identity, path, domain, scope, resumeAudio]);
  const [state, setState] = useState<{ requestKey: string; attempt?: ServerAttempt; answers: Record<string, string>; loadingAttempt: boolean; busy: boolean; error?: string }>({ requestKey: "", answers: {}, loadingAttempt: true, busy: false });
  const current = state.requestKey === requestKey && !loading ? state : undefined;
  const loadingAttempt = current?.loadingAttempt ?? true;
  useEffect(() => {
    const version = ++generation.current;
    persistence.current = null;
    pending.current = false;
    latestAnswers.current = {};
    saveVersion.current++;
    const controller = new AbortController();
    if (scope) {
      const url = new URL(window.location.href);
      const parts = scope.split("/");
      url.searchParams.set("mini_session", parts[4]);
      url.searchParams.set("mini_part", parts[5]);
      window.history.replaceState(null, "", url);
    }
    const params = new URLSearchParams(window.location.search);
    let remembered: string | null = null;
    try { if (resumeKey) remembered = sessionStorage.getItem(resumeKey); } catch { /* Storage unavailable; explicit attempt URL still works. */ }
    const id = scope ? params.get(`mini_attempt_${scope}`) ?? (params.get("attempt_scope") === scope ? params.get("attempt") : null) : params.get("attempt") ?? remembered;
    const discoverPlacement = domain === "placement" && path === "/api/placement/attempts" && Boolean(user?.id) && !id;
    if (identity && ((id && /^[1-9]\d*$/.test(id)) || discoverPlacement)) {
      setState({ requestKey, answers: {}, loadingAttempt: true, busy: false });
      const load = discoverPlacement
        ? apiRequest<{ data: ServerAttempt | null }>(`${path}/current`, { signal: controller.signal }).then(({ data }) => data ? readAttempt(`${path}/${data.id}`, controller.signal) : undefined)
        : readAttempt(`${path}/${id}`, controller.signal);
      load.then(attempt => {
        if (version !== generation.current || controller.signal.aborted) return;
        if (!attempt) {
          setState({ requestKey, answers: {}, loadingAttempt: false, busy: false });
          return;
        }
        if (discoverPlacement) {
          const url = new URL(window.location.href);
          url.searchParams.set("attempt", String(attempt.id));
          window.history.replaceState(null, "", url);
        }
        if (scope && `${identity}/${path.split("/")[4]}/${attempt.chapter_id}/mini/${attempt.session}/${attempt.part}` !== scope) throw new ApiError(404);
        if (resumeAudio && attempt.kind !== "audio") throw new ApiError(404);
        if (resumeKey) {
          try { sessionStorage.setItem(resumeKey, String(attempt.id)); } catch { /* URL remains usable without storage. */ }
          const url = new URL(window.location.href);
          url.searchParams.set("attempt", String(attempt.id));
          url.searchParams.delete("start");
          window.history.replaceState(null, "", url);
        }
        persistence.current = new AttemptPersistence(attempt, `${path}/${attempt.id}`, domain);
        latestAnswers.current = attempt.answers;
        setState({ requestKey, attempt, answers: attempt.answers, loadingAttempt: false, busy: false });
      }).catch(error => {
        if (version === generation.current && !controller.signal.aborted) setState({ requestKey, answers: {}, loadingAttempt: false, busy: false, error: error instanceof Error ? error.message : new ApiError(0).message });
      });
    } else {
      setState({ requestKey, answers: {}, loadingAttempt: false, busy: false });
    }
    return () => { controller.abort(); if (generation.current === version) generation.current = version + 1; };
  }, [path, domain, identity, scope, requestKey, resumeAudio, resumeKey, user?.id]);
  async function run(action: () => Promise<ServerAttempt>, replaceAnswers = false) {
    const version = generation.current;
    setState(previous => ({ ...previous, requestKey, busy: true, error: undefined }));
    try {
      const attempt = await action();
      if (version === generation.current) {
        if (replaceAnswers || attempt.status === "completed") latestAnswers.current = attempt.answers;
        setState(previous => ({ requestKey, attempt, answers: replaceAnswers || attempt.status === "completed" ? attempt.answers : previous.answers, loadingAttempt: false, busy: false }));
      }
      return version === generation.current ? attempt : undefined;
    } catch (error) {
      if (version === generation.current) setState(previous => ({ ...previous, busy: false, error: error instanceof Error ? error.message : new ApiError(0).message }));
      return undefined;
    }
  }
  async function start(body: object = {}) {
    if (pending.current || loadingAttempt || !identity) return;
    pending.current = true;
    const version = generation.current;
    const attempt = await run(() => startAttempt(path, body), true);
    if (attempt && version === generation.current) {
      persistence.current = new AttemptPersistence(attempt, `${path}/${attempt.id}`, domain);
      const url = new URL(window.location.href);
      url.searchParams.set("attempt", String(attempt.id));
      if (resumeKey) {
        try { sessionStorage.setItem(resumeKey, String(attempt.id)); } catch { /* URL remains usable without storage. */ }
        url.searchParams.delete("start");
      }
      if ((domain === "tryout" || domain === "checkpoint")) {
        url.searchParams.delete("tryout_stage");
        url.searchParams.delete("tryout_question");
      }
      if (scope) {
        url.searchParams.set("attempt_scope", scope);
        url.searchParams.set(`mini_attempt_${scope}`, String(attempt.id));
        url.searchParams.set("mini_session", String(attempt.session));
        url.searchParams.set("mini_part", String(attempt.part));
      }
      window.history.replaceState(null, "", url);
    }
    if (version === generation.current) pending.current = false;
  }
  function answer(id: number, option: string) {
    if (!current?.attempt || current.attempt.status === "completed" || !persistence.current) return;
    if (pending.current) return;
    const answers = { ...latestAnswers.current, [id]: option };
    latestAnswers.current = answers;
    const version = generation.current;
    const saved = ++saveVersion.current;
    setState(previous => ({ ...previous, answers, busy: true, error: undefined }));
    persistence.current.save(answers).then(attempt => {
      if (version === generation.current && saved === saveVersion.current && !pending.current) {
        if (attempt.status === "completed") latestAnswers.current = attempt.answers;
        setState(previous => ({ ...previous, attempt, answers: attempt.status === "completed" ? attempt.answers : previous.answers, busy: false }));
      }
    }).catch(error => {
      if (version === generation.current && saved === saveVersion.current && !pending.current) {
        setState(previous => ({ ...previous, busy: false, error: error instanceof Error ? error.message : new ApiError(0).message }));
      }
    });
  }
  async function retrySave() {
    if (!persistence.current || !current || current.busy || pending.current) return;
    return run(() => persistence.current!.save(latestAnswers.current));
  }
  async function synchronize() {
    if ((domain !== "tryout" && domain !== "checkpoint") || !persistence.current || !current || pending.current) return;
    pending.current = true;
    const result = await run(() => persistence.current!.save(latestAnswers.current));
    pending.current = false;
    return result;
  }
  async function finishSession() {
    if (!persistence.current || !current || current.busy || pending.current) return;
    pending.current = true;
    const result = await run(() => persistence.current!.save(current.answers, true));
    pending.current = false;
    return result;
  }
  async function submit() {
    if (!persistence.current || !current || ((domain !== "tryout" && domain !== "checkpoint") && current.busy) || pending.current) return;
    pending.current = true;
    const result = await run(() => persistence.current!.submit(latestAnswers.current));
    pending.current = false;
    return result;
  }
  async function expire() {
    if ((domain !== "tryout" && domain !== "checkpoint") || !persistence.current || !current) return;
    pending.current = true;
    const result = await run(() => persistence.current!.expire());
    pending.current = false;
    return result;
  }
  async function review() {
    if (current?.attempt?.status !== "completed") return;
    return run(() => readAttempt(`${path}/${current.attempt!.id}/review`));
  }
  return { attempt: current?.attempt, answers: current?.answers ?? {}, loadingAttempt, busy: current?.busy ?? false, submitting: pending.current && Boolean(current?.busy), error: current?.error, start, answer, retrySave, synchronize, finishSession, submit, expire, review };
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { AttemptPersistence, readAttempt, startAttempt, type AttemptDomain, type ServerAttempt } from "@/lib/assessment-attempt";

export function useAssessmentAttempt(path: string, domain: AttemptDomain) {
  const { user, loading } = useAuth();
  const identity = loading ? undefined : domain === "placement" ? `placement:${user?.id ?? "guest"}` : user?.id;
  const persistence = useRef<AttemptPersistence | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const [state, setState] = useState<{ identity: typeof identity; path: string; attempt?: ServerAttempt; answers: Record<string, string>; busy: boolean; error?: string }>({ identity: undefined, path: "", answers: {}, busy: false });
  const current = state.identity === identity && state.path === path && (domain === "placement" || !loading) ? state : undefined;
  useEffect(() => {
    const version = ++generation.current;
    persistence.current = null;
    pending.current = false;
    const controller = new AbortController();
    const id = new URLSearchParams(window.location.search).get("attempt");
    if (identity && id && /^[1-9]\d*$/.test(id)) {
      readAttempt(`${path}/${id}`, controller.signal).then(attempt => {
        if (version !== generation.current || controller.signal.aborted) return;
        persistence.current = new AttemptPersistence(attempt, `${path}/${attempt.id}`, domain);
        setState({ identity, path, attempt, answers: attempt.answers, busy: false });
      }).catch(error => {
        if (!controller.signal.aborted) setState({ identity, path, answers: {}, busy: false, error: error instanceof Error ? error.message : new ApiError(0).message });
      });
    }
    return () => { controller.abort(); if (generation.current === version) generation.current = version + 1; };
  }, [path, domain, identity]);
  async function run(action: () => Promise<ServerAttempt>, replaceAnswers = false) {
    const version = generation.current;
    setState(previous => ({ ...previous, identity, path, busy: true, error: undefined }));
    try {
      const attempt = await action();
      if (version === generation.current) setState(previous => ({ identity, path, attempt, answers: replaceAnswers ? attempt.answers : previous.answers, busy: false }));
      return attempt;
    } catch (error) {
      if (version === generation.current) setState(previous => ({ ...previous, busy: false, error: error instanceof Error ? error.message : new ApiError(0).message }));
      return undefined;
    }
  }
  async function start(body: object = {}) {
    if (pending.current || !identity) return;
    pending.current = true;
    const version = generation.current;
    const attempt = await run(() => startAttempt(path, body), true);
    if (attempt && version === generation.current) {
      persistence.current = new AttemptPersistence(attempt, `${path}/${attempt.id}`, domain);
      const url = new URL(window.location.href);
      url.searchParams.set("attempt", String(attempt.id));
      window.history.replaceState(null, "", url);
    }
    pending.current = false;
  }
  function answer(id: number, option: string) {
    if (!current?.attempt || current.attempt.status === "completed" || !persistence.current) return;
    const answers = { ...current.answers, [id]: option };
    setState(previous => ({ ...previous, answers, error: undefined }));
    persistence.current.save(answers).catch(() => undefined);
  }
  async function finishSession() {
    if (!persistence.current || !current || current.busy || pending.current) return;
    pending.current = true;
    const result = await run(() => persistence.current!.save(current.answers, true));
    pending.current = false;
    return result;
  }
  function submit() {
    if (!persistence.current || !current || current.busy) return;
    return run(() => persistence.current!.submit(current.answers));
  }
  async function review() {
    if (current?.attempt?.status !== "completed") return;
    return run(() => readAttempt(`${path}/${current.attempt!.id}/review`));
  }
  return { attempt: current?.attempt, answers: current?.answers ?? {}, busy: current?.busy ?? false, error: current?.error, start, answer, finishSession, submit, review };
}

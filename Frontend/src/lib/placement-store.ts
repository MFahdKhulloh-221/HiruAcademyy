"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import type { AttemptQuestion } from "@/lib/assessment-attempt";

export type PublishedPlacement = { config: { id: string; title: string; introHeading: string; durationMinutes: number; description: string; questions: { id: string; number: number; area: string; prompt: string; audioUrl?: string | null; options: { id: string; text: string }[] }[] } | null; loading: boolean; error?: string };
type PlacementPayload = { id: number; title: string; intro_heading: string; duration_minutes: number; description: string; questions: (AttemptQuestion & { category: string })[] };
export function usePublishedPlacement(): PublishedPlacement {
  const { loading: authLoading, authenticated } = useAuth();
  const [state, setState] = useState<PublishedPlacement>({ config: null, loading: true });
  useEffect(() => {
    if (authLoading) return;
    const controller = new AbortController();
    apiRequest<{ data: PlacementPayload }>("/api/placement", { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setState({ loading: false, config: { id: String(data.id), title: data.title, introHeading: data.intro_heading, description: data.description, durationMinutes: data.duration_minutes, questions: data.questions.map((question, index) => ({ id: String(question.id), number: index + 1, area: question.category, prompt: question.prompt ?? "", audioUrl: question.audio_url, options: Object.entries(question.options).map(([id, text]) => ({ id, text })) })) } });
    }).catch(error => { if (!controller.signal.aborted) setState({ config: null, loading: false, error: error instanceof Error ? error.message : "Permintaan belum berhasil. Silakan coba lagi." }); });
    return () => controller.abort();
  }, [authLoading, authenticated]);
  return state;
}

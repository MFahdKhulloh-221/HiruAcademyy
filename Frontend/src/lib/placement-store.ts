"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import type { AttemptQuestion } from "@/lib/assessment-attempt";

export type PublishedPlacement = { config: { id: string; title: string; introHeading: string; durationMinutes: number | null; adaptive?: boolean; questionCount: number; description: string; isReady: boolean; questions: { id: string; number: number; area: string; prompt: string; audioUrl?: string | null; options: { id: string; text: string }[] }[] } | null; loading: boolean; error?: string };
type PlacementPayload = { id: number; title: string; intro_heading: string; duration_minutes: number | null; adaptive?: boolean; question_count?: number; description: string; is_ready?: boolean; questions: (AttemptQuestion & { category: string })[] };
export function usePublishedPlacement(): PublishedPlacement {
  const { loading: authLoading, authenticated } = useAuth();
  const [state, setState] = useState<PublishedPlacement>({ config: null, loading: true });
  useEffect(() => {
    if (authLoading) return;
    const controller = new AbortController();
    apiRequest<{ data: PlacementPayload }>("/api/placement", { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setState({ loading: false, config: { id: String(data.id), title: data.title, introHeading: data.intro_heading, description: data.description, durationMinutes: data.duration_minutes, adaptive: data.adaptive, questionCount: data.question_count ?? data.questions.length, isReady: data.is_ready !== false, questions: data.questions.map((question, index) => ({ id: String(question.id), number: index + 1, area: question.category, prompt: question.prompt ?? "", audioUrl: question.audio_url, options: Object.entries(question.options).map(([id, text]) => ({ id, text })) })) } });
    }).catch(error => { if (!controller.signal.aborted) setState({ config: null, loading: false, error: error instanceof ApiError && error.status === 404 ? "Placement Test sedang disiapkan. Silakan coba lagi nanti." : (error instanceof Error ? error.message : "Permintaan belum berhasil. Silakan coba lagi.") }); });
    return () => controller.abort();
  }, [authLoading, authenticated]);
  return state;
}

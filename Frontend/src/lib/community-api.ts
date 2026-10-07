import { apiRequest } from "./api";

export type CommunityTopic = {
  id: number;
  slug: string;
  title: string;
  description: string;
  threads_count: number;
};

export type CommunityReply = {
  id: number;
  content: string;
  status: string;
  author: { id: number; name: string; is_sensei: boolean };
  created_at: string;
};

export type CommunityThread = {
  id: number;
  topic_id: number;
  topic_title: string;
  topic_slug: string;
  title: string;
  content: string;
  is_ask_sensei: boolean;
  status: string;
  replies_count: number;
  author: { id: number; name: string; is_sensei: boolean };
  created_at: string;
  replies?: CommunityReply[];
};

export async function fetchCommunityTopics(signal?: AbortSignal) {
  return (await apiRequest<{ data: CommunityTopic[] }>("/api/community/topics", { signal })).data;
}

export async function fetchCommunityThreads(params: { topic_slug?: string; is_ask_sensei?: boolean; search?: string } = {}, signal?: AbortSignal) {
  const query = new URLSearchParams();
  if (params.topic_slug) query.set("topic_slug", params.topic_slug);
  if (params.is_ask_sensei !== undefined) query.set("is_ask_sensei", String(params.is_ask_sensei));
  if (params.search) query.set("search", params.search);
  const qStr = query.toString();
  return (await apiRequest<{ data: CommunityThread[] }>(`/api/community/threads${qStr ? `?${qStr}` : ""}`, { signal })).data;
}

export async function fetchCommunityThread(id: number | string, signal?: AbortSignal) {
  return (await apiRequest<{ data: CommunityThread }>(`/api/community/threads/${id}`, { signal })).data;
}

export async function createCommunityThread(body: { topic_id: number; title: string; content: string; is_ask_sensei?: boolean }) {
  return (await apiRequest<{ data: { id: number; title: string } }>("/api/community/threads", {
    method: "POST",
    body: JSON.stringify(body),
  })).data;
}

export async function createCommunityReply(threadId: number | string, content: string) {
  return (await apiRequest<{ data: CommunityReply }>(`/api/community/threads/${threadId}/replies`, {
    method: "POST",
    body: JSON.stringify({ content }),
  })).data;
}

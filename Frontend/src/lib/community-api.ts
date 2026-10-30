import { apiRequest } from "./api";

export type CommunityTopic = {
  id: number;
  slug: string;
  title: string;
  description: string;
  threads_count: number;
};

export async function reportCommunityMessage(id: number, reason: string) {
  return apiRequest<{ data: { id: number; status: string } }>(`/api/community/messages/${id}/reports`, { method: "POST", body: JSON.stringify({ reason }) });
}

export type CommunityRoom = { id: number; topic_id: number; topic_slug: string };
export type CommunityMessage = {
  id: number;
  room_id: number;
  client_message_id: string;
  content: string;
  status: string;
  author: { id: number; name: string; is_sensei: boolean };
  created_at: string;
};
export type CommunityMessagePage = {
  data: CommunityMessage[];
  meta: { has_more: boolean; before: number | null; after: number; requires_history_refresh: boolean };
};

export async function fetchCommunityRoom(topicId: number, signal?: AbortSignal) {
  return (await apiRequest<{ data: CommunityRoom }>(`/api/community/topics/${topicId}/room`, { signal })).data;
}

export async function fetchCommunityMessages(roomId: number, before?: number, signal?: AbortSignal) {
  return apiRequest<CommunityMessagePage>(`/api/community/rooms/${roomId}/messages${before ? `?before=${before}` : ""}`, { signal });
}

export async function sendCommunityMessage(roomId: number, body: { client_message_id: string; content: string }, signal?: AbortSignal) {
  return (await apiRequest<{ data: CommunityMessage }>(`/api/community/rooms/${roomId}/messages`, {
    method: "POST", body: JSON.stringify(body), signal,
  })).data;
}

export async function fetchCommunityTopics(signal?: AbortSignal) {
  return (await apiRequest<{ data: CommunityTopic[] }>("/api/community/topics", { signal })).data;
}

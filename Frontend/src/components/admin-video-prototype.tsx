"use client";

import { AdminLearningMediaWorkspace, type LearningMedia } from "@/components/admin-learning-media-preview";

const approvedVideos: LearningMedia[] = [{
  id: "video-n4-chapter-1",
  title: "Video N4 | Chapter 1",
  description: "Tonton penjelasan utama chapter.",
  context: "N4",
  chapter: "Chapter 1",
  type: "Video",
  file: null,
  filename: "",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  duration: "40",
  order: "1",
  status: "Published",
}];

export function AdminVideoPrototype() {
  return <AdminLearningMediaWorkspace kind="Video" initialRows={approvedVideos} />;
}

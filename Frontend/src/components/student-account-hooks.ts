"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useLearningRequest } from "@/components/learning-hooks";
import { ApiError, apiRequest } from "@/lib/api";
import { studentNotifications } from "@/lib/schedule-replay-api";

export function useStudentNotifications() {
  const request = useLearningRequest(studentNotifications, "notifications");
  const retry = useRef(request.retry);
  useEffect(() => { retry.current = request.retry; }, [request.retry]);
  useEffect(() => {
    const refresh = () => retry.current();
    window.addEventListener("hiru:notifications-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("hiru:notifications-changed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return request;
}

export function useProfileAvatar() {
  const { refreshUser } = useAuth();
  const pending = useRef(false);
  const [busy, setBusy] = useState<"upload" | "delete" | null>(null);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  async function update(file?: File) {
    if (pending.current) return;
    setError("");
    setSuccess(false);
    if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Pilih foto dengan format JPEG, PNG, atau WebP.");
      return;
    }
    pending.current = true;
    setBusy(file ? "upload" : "delete");
    try {
      const body = file ? new FormData() : undefined;
      if (file) body!.append("file", file);
      await apiRequest("/api/student/profile/avatar", { method: file ? "POST" : "DELETE", body });
      if (!await refreshUser({ background: true })) throw new ApiError(401);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.status === 413 ? "Foto terlalu besar. Pilih foto yang lebih kecil." : err.status === 422 ? "Foto belum dapat digunakan. Pilih foto JPEG, PNG, atau WebP lainnya." : err.message : "Foto profil belum berhasil diperbarui. Silakan coba lagi.");
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }
  return { busy, success, error, update };
}

import { apiRequest } from "@/lib/api";

export type CertificateIssuer = {
  signature_data_url: string | null;
  signature_position: "bottom-left" | "bottom-right";
};

export async function getCertificateIssuer(signal?: AbortSignal): Promise<CertificateIssuer> {
  const result = await apiRequest<{ data: CertificateIssuer }>("/api/admin/certificate-issuer", { signal });
  return result.data;
}

export async function saveCertificateIssuer(settings: { signature?: File; signature_position?: CertificateIssuer["signature_position"]; remove_signature?: boolean }): Promise<CertificateIssuer> {
  const body = new FormData();
  if (settings.signature) body.set("signature", settings.signature);
  if (settings.signature_position) body.set("signature_position", settings.signature_position);
  if (settings.remove_signature !== undefined) body.set("remove_signature", settings.remove_signature ? "1" : "0");
  const result = await apiRequest<{ data: CertificateIssuer }>("/api/admin/certificate-issuer", { method: "POST", body });
  return result.data;
}

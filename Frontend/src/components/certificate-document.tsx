import { useId } from "react";
import styles from "./certificate-document.module.css";

export type CertificateDocumentProps = {
  studentName: string;
  programName: string;
  title: string;
  description: string;
  issuedAt: string;
  signatureDataUrl?: string | null;
  signaturePosition?: "bottom-left" | "bottom-right";
};

const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" });
function lines(text: string, width: number) {
  const result: string[] = [];
  for (const word of text.trim().split(/\s+/u)) {
    const last = result.length - 1;
    if (last >= 0 && result[last].length + word.length + 1 <= width) result[last] += ` ${word}`;
    else result.push(word);
  }
  return result;
}

export function CertificateDocument({ studentName, programName, title, description, issuedAt, signatureDataUrl, signaturePosition = "bottom-right" }: CertificateDocumentProps) {
  const label = useId();
  const date = new Date(issuedAt);
  const descriptionLines = lines(description, 100);
  const descriptionSize = Math.min(16, 65 / Math.max(1, descriptionLines.length));
  const signatureX = signaturePosition === "bottom-left" ? 205 : 918;
  const validSignature = signatureDataUrl?.startsWith("data:image/png;base64,") ? signatureDataUrl : null;
  return <svg className={styles.document} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1123 794" role="img" aria-labelledby={label} aria-describedby={`${label}-description`}>
    <title id={label}>Sertifikat penyelesaian {programName} — {studentName}</title>
    <desc id={`${label}-description`}>{title}. {description}. Tanggal penerbitan: {Number.isFinite(date.getTime()) ? dateFormat.format(date) : "Tidak tersedia"}. Penerbit: HiruAcademy.</desc>
    <rect width="1123" height="794" fill="#FFFFFF" />
    <rect width="1123" height="16" fill="#132E4A" />
    <rect y="778" width="1123" height="16" fill="#FF7900" />
    <path d="M962 16H1123V177L1080 134V59H1005Z" fill="#FF7900" />
    <path d="M1051 16H1123V88Z" fill="#132E4A" />
    <g fill="#132E4A" fontFamily="Arial, sans-serif" textAnchor="middle">
      <image href="/brand/hiru-bawah.png" x="68" y="65" width="300" height="48.28" preserveAspectRatio="xMinYMid meet" />
      <text x="561.5" y="221" fontSize="62" fontWeight="700" letterSpacing="10">CERTIFICATE</text>
      <text x="561.5" y="255" fontSize="13" fontWeight="700" letterSpacing="5" fill="#FF7900">OFFICIAL PROGRAM RECOGNITION</text>
      <text x="561.5" y="309" fontSize="15" fill="#526477">Diberikan kepada</text>
      <text x="561.5" y="374" fontSize={Math.min(52, 1500 / Math.max(Math.min(studentName.length, 65), 1))} fontWeight="700" {...(studentName.length > 65 ? { textLength: 920, lengthAdjust: "spacingAndGlyphs" as const } : {})}>{studentName}</text>
      <path d="M448 398H675" stroke="#FF7900" strokeWidth="3" />
      <text x="561.5" y="442" fontSize={Math.min(24, 1300 / Math.max(title.length, 1))} fontWeight="700">{title}</text>
      <text x="561.5" y="479" fontSize={Math.min(21, 1250 / Math.max(programName.length, 1))} fontWeight="700" fill="#FF7900">{programName}</text>
      {descriptionLines.map((line, index) => <text key={index} x="561.5" y={510 + index * descriptionSize * 1.3} fontSize={descriptionSize} fill="#526477" {...(line.length > 105 ? { textLength: 950, lengthAdjust: "spacingAndGlyphs" as const } : {})}>{line}</text>)}
      <text x={signaturePosition === "bottom-left" ? 918 : 205} y="678" fontSize="13" fill="#526477">Tanggal penerbitan</text>
      <text x={signaturePosition === "bottom-left" ? 918 : 205} y="706" fontSize="17" fontWeight="700">{Number.isFinite(date.getTime()) ? dateFormat.format(date) : "Tidak tersedia"}</text>
      {validSignature && <image href={validSignature} x={signatureX - 120} y="615" width="240" height="80" preserveAspectRatio="xMidYMid meet" />}
      <path d={`M${signatureX - 120} 702h240`} stroke="#132E4A" strokeWidth="1" />
      <text x={signatureX} y="726" fontSize="17" fontWeight="700">HiruAcademy</text>
      <text x={signatureX} y="748" fontSize="12" fill="#526477">Penerbit · Penyelesaian Program</text>
    </g>
  </svg>;
}

import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";
import "./stitch-visual.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://hiruacademy.id"),
  title: {
    default: "HIRU Academy",
    template: "%s | HIRU Academy",
  },
  description: "Platform belajar Bahasa Jepang HIRU Academy.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${plusJakartaSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([{ "@context": "https://schema.org", "@type": "Organization", "@id": "https://hiruacademy.id/#organization", name: "HIRU Academy", url: "https://hiruacademy.id" }, { "@context": "https://schema.org", "@type": "WebSite", "@id": "https://hiruacademy.id/#website", name: "HIRU Academy", url: "https://hiruacademy.id", inLanguage: "id-ID", publisher: { "@id": "https://hiruacademy.id/#organization" } }]) }} /><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}

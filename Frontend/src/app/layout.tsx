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
  title: {
    default: "HIRU Academy",
    template: "%s | HIRU Academy",
  },
  description: "Platform belajar Bahasa Jepang HIRU Academy.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${plusJakartaSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col"><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}

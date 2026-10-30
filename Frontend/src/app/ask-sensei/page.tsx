import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Tanya Sensei", robots: { index: false, follow: false } };

export default function AskSenseiPage() {
  redirect("/community?topic=tanya-sensei");
}

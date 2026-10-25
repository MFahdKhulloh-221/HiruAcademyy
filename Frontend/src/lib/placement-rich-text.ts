import DOMPurify from "dompurify";

export function placementText(value: string): string {
  if (typeof window === "undefined") return value;
  const container = document.createElement("div");
  container.innerHTML = placementHtml(value);
  container.querySelectorAll("rt").forEach(node => node.remove());
  return (container.textContent ?? "").replace(/\u00a0/g, " ");
}

export function placementHtml(value: string): string {
  if (typeof window === "undefined") return "";
  const html = /<\/?(?:strong|em|u|ruby|rt|br|p|b|i|div)\b/i.test(value) ? value : value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ["strong", "em", "u", "ruby", "rt", "br", "p", "b", "i", "div"], ALLOWED_ATTR: [] });
}

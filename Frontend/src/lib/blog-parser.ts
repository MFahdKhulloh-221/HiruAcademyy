import type { ArticleBlock } from "@/lib/admin-website-store";

// ponytail: basic line/block parser for markdown/HTML/JSON. Add AST markdown parser when rich tables or code fences are needed.

export function isSafeImageUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.includes("\\")) return false;
  if (trimmed.startsWith("/")) return true;
  try {
    const parsed = new URL(trimmed);
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function parseArticleBody(rawBody: unknown): ArticleBlock[] {
  if (typeof rawBody !== "string" || !rawBody.trim()) return [];

  const text = rawBody.trim();

  // 1. Support serialized JSON blocks (from Admin Block Editor / Studio)
  if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      if (list.length > 0 && typeof list[0] === "object" && list[0] !== null && "type" in list[0]) {
        return list.map((item, index) => ({
          id: String(item.id || `block-${index}`),
          type: item.type,
          text: item.text,
          items: Array.isArray(item.items) ? item.items : undefined,
          url: isSafeImageUrl(item.url) ? item.url : undefined,
          alt: item.alt,
          caption: item.caption,
        }));
      }
    } catch {
      // fallback to text parser
    }
  }

  // 2. Line-by-line block segmentation
  const lines = text.split("\n");
  const blocks: ArticleBlock[] = [];
  let blockCount = 0;

  let currentParagraph: string[] = [];
  let currentBulletList: string[] = [];
  let currentNumList: string[] = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      blocks.push({
        id: `block-${++blockCount}`,
        type: "paragraph",
        text: currentParagraph.join(" ").trim(),
      });
      currentParagraph = [];
    }
  };

  const flushBulletList = () => {
    if (currentBulletList.length > 0) {
      blocks.push({
        id: `block-${++blockCount}`,
        type: "bulleted-list",
        items: [...currentBulletList],
      });
      currentBulletList = [];
    }
  };

  const flushNumList = () => {
    if (currentNumList.length > 0) {
      blocks.push({
        id: `block-${++blockCount}`,
        type: "numbered-list",
        items: [...currentNumList],
      });
      currentNumList = [];
    }
  };

  const flushAll = () => {
    flushParagraph();
    flushBulletList();
    flushNumList();
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushAll();
      continue;
    }

    if (line.startsWith("## ")) {
      flushAll();
      blocks.push({
        id: `block-${++blockCount}`,
        type: "h2",
        text: line.replace(/^##\s+/, "").trim(),
      });
      continue;
    }

    if (line.startsWith("### ")) {
      flushAll();
      blocks.push({
        id: `block-${++blockCount}`,
        type: "h3",
        text: line.replace(/^###\s+/, "").trim(),
      });
      continue;
    }

    const mdImgMatch = line.match(/^!\[(.*?)\]\((https?:\/\/[^\s")]+|\/[^\s")]+)(?:\s+"(.*?)")?\)$/);
    if (mdImgMatch) {
      const alt = mdImgMatch[1]?.trim() || "Ilustrasi artikel";
      const url = mdImgMatch[2]?.trim();
      const caption = mdImgMatch[3]?.trim() || alt;
      if (isSafeImageUrl(url)) {
        flushAll();
        blocks.push({
          id: `block-${++blockCount}`,
          type: "image",
          url,
          alt,
          caption,
        });
        continue;
      }
    }

    const htmlImgSrc = line.match(/<img\s+[^>]*src=["']([^"']+)["'][^>]*\/?>/i);
    if (htmlImgSrc) {
      const url = htmlImgSrc[1]?.trim();
      const altMatch = line.match(/<img\s+[^>]*alt=["']([^"']*)["'][^>]*\/?>/i);
      const alt = altMatch ? altMatch[1]?.trim() : "Ilustrasi artikel";
      if (isSafeImageUrl(url)) {
        flushAll();
        blocks.push({
          id: `block-${++blockCount}`,
          type: "image",
          url,
          alt: alt || "Ilustrasi artikel",
          caption: alt || undefined,
        });
        continue;
      }
    }

    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      flushNumList();
      currentBulletList.push(line.replace(/^[-*]\s+/, "").trim());
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      flushParagraph();
      flushBulletList();
      currentNumList.push(line.replace(/^\d+\.\s+/, "").trim());
      continue;
    }

    const linkMatch = line.match(/^\[(.*?)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)$/);
    if (linkMatch && isSafeImageUrl(linkMatch[2])) {
      flushAll();
      blocks.push({
        id: `block-${++blockCount}`,
        type: "link",
        text: linkMatch[1]?.trim() || linkMatch[2],
        url: linkMatch[2],
      });
      continue;
    }

    flushBulletList();
    flushNumList();
    currentParagraph.push(line);
  }

  flushAll();
  return blocks;
}

import Link from "next/link";
import { isSafeImageUrl, parseArticleBody } from "@/lib/blog-parser";
import type { ArticleBlock } from "@/lib/admin-website-store";

function renderInlineText(text: string) {
  if (!text.includes("[") || !text.includes("](") || !text.includes(")")) {
    return text;
  }
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, index) => {
    const match = part.match(/^\[(.*?)\]\((.*?)\)$/);
    if (!match) return part;
    const label = match[1];
    const href = match[2];
    if (!isSafeImageUrl(href)) return label;
    const isInternal = href.startsWith("/") && !href.startsWith("//");
    if (isInternal) {
      return (
        <Link key={index} href={href} style={{ color: "var(--orange-dark)", textDecoration: "underline" }}>
          {label}
        </Link>
      );
    }
    return (
      <a key={index} href={href} rel="noopener noreferrer" target="_blank" style={{ color: "var(--orange-dark)", textDecoration: "underline" }}>
        {label}
      </a>
    );
  });
}

function renderBlock(block: ArticleBlock) {
  switch (block.type) {
    case "paragraph":
      return <p key={block.id}>{renderInlineText(block.text || "")}</p>;
    case "h2":
      return <h2 id={block.id} key={block.id}>{block.text}</h2>;
    case "h3":
      return <h3 id={block.id} key={block.id}>{block.text}</h3>;
    case "bulleted-list":
      return (
        <ul key={block.id}>
          {block.items?.map((item, index) => (
            <li key={index}>{renderInlineText(item)}</li>
          ))}
        </ul>
      );
    case "numbered-list":
      return (
        <ol key={block.id}>
          {block.items?.map((item, index) => (
            <li key={index}>{renderInlineText(item)}</li>
          ))}
        </ol>
      );
    case "link":
      return (
        <p key={block.id}>
          <a
            href={isSafeImageUrl(block.url) ? block.url : undefined}
            rel="noopener noreferrer"
            style={{ color: "var(--orange-dark)", textDecoration: "underline" }}
            target="_blank"
          >
            {block.text || block.url}
          </a>
        </p>
      );
    case "image":
      return (
        <figure key={block.id} className="blog-article-figure" style={{ margin: "28px 0" }}>
          {block.url && isSafeImageUrl(block.url) ? (
            <div style={{ position: "relative", width: "100%", borderRadius: "16px", overflow: "hidden", background: "#f8f9fc", border: "1px solid #eef0f4" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={block.url}
                alt={block.alt || "Gambar artikel"}
                style={{ width: "100%", height: "auto", display: "block", maxHeight: "540px", objectFit: "contain", margin: "0 auto" }}
                loading="lazy"
              />
            </div>
          ) : null}
          {block.caption && (
            <figcaption style={{ marginTop: "10px", fontSize: "14px", color: "var(--muted, #64748b)", textAlign: "center", fontStyle: "italic" }}>
              {block.caption}
            </figcaption>
          )}
        </figure>
      );
    default:
      return null;
  }
}

export function BlogArticleBody({ body }: { body: string }) {
  const blocks = parseArticleBody(body).map((block, index) => ({ ...block, id: `section-${index + 1}` }));
  return <div className="editorial-body">{blocks.map(renderBlock)}</div>;
}

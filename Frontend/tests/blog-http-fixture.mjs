import http from "node:http";

export const articles = Array.from({ length: 14 }, (_, index) => ({
  id: index + 1, slug: `qa-artikel-${index + 1}`, title: `Artikel QA ${index + 1}`,
  category: ["Tips Belajar", "Grammar / Bunpou", "Listening / Choukai", "JLPT"][index % 4],
  excerpt: `Pengantar editorial ${index + 1}.`, author: `Penulis QA ${index + 1}`,
  published_at: "2026-01-02T03:00:00Z", published: true, featured: index === 0,
  seo_title: index === 1 ? null : `SEO Artikel QA ${index + 1}`,
  meta_description: index === 1 ? null : `Deskripsi SEO ${index + 1}.`,
  thumbnail: index === 1 ? "/blog/missing-qa.png" : "/blog/tamnel4.png",
  body: JSON.stringify([
    { id: "intro", type: "paragraph", text: `Pembahasan nyata fixture ${index + 1}. [Panduan terkait](/blog/qa-artikel-2)` },
    { id: "first", type: "h2", text: "Memahami materi" },
    { id: "list", type: "bulleted-list", items: ["Contoh pertama", "Contoh kedua"] },
    { id: "second", type: "h3", text: "Contoh penggunaan" },
    { id: "end", type: "paragraph", text: "日本語を勉強します。 Belajar bahasa Jepang." },
  ]),
}));
const unsafeText = 'QA < > " </script><script>globalThis.qaInjected=true</script>';
const securityArticle = { ...articles[0], id: 200, slug: "qa-security", title: unsafeText, excerpt: unsafeText, seo_title: unsafeText, meta_description: unsafeText };
const hidden = [
  { ...articles[0], id: 100, slug: "qa-draft", title: "Draft rahasia QA", published: false },
  { ...articles[0], id: 101, slug: "qa-scheduled", title: "Scheduled rahasia QA", published_at: "2099-01-01T00:00:00Z" },
];
let mode = "normal";
let catalogArticles = [];
http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:3412");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (url.pathname === "/fixtures/articles" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => { try { catalogArticles = JSON.parse(body); mode = "catalog"; res.end("ok"); } catch { res.writeHead(400).end(); } });
    return;
  }
  if (url.pathname === "/health") { res.end("ok"); return; }
  if (url.pathname === "/mode" && req.method === "POST") { mode = url.searchParams.get("value") || "normal"; res.end(mode); return; }
  if (!url.pathname.startsWith("/api/blog")) { res.writeHead(404).end(); return; }
  const respond = () => {
    if (mode === "unavailable") { res.destroy(); return; }
    if (mode === "error" || mode === "500") { res.writeHead(mode === "500" ? 500 : 503).end("fixture unavailable"); return; }
    // Normal mode implements existing Laravel public visibility contract.
    // Leaky mode tests frontend defensive filtering without changing backend.
    const data = mode === "catalog" ? catalogArticles.filter(article => article.published && (!article.published_at || Date.parse(article.published_at) <= Date.now())) : mode === "empty" ? [] : mode === "leaky" ? [...articles, ...hidden] : mode === "security" ? [...articles, securityArticle] : articles;
    const slug = url.pathname.slice("/api/blog/".length);
    const result = url.pathname === "/api/blog" ? data : data.find(article => article.slug === slug);
    res.setHeader("Content-Type", "application/json");
    res.writeHead(result ? 200 : 404).end(JSON.stringify({ data: result ?? null }));
  };
  if (mode === "timeout") { const timer = setTimeout(respond, 12000); res.on("close", () => clearTimeout(timer)); }
  else respond();
}).listen(3412, "127.0.0.1");

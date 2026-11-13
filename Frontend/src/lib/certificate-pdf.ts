"use client";

const PAGE_WIDTH = 841.8898;
const PAGE_HEIGHT = 595.2756;

/** One RGB JPEG, one landscape A4 page. Offsets count bytes, never JS characters. */
export function buildCertificatePdf(jpeg: Uint8Array, width: number, height: number): Uint8Array {
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0 ||
      jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 ||
      jpeg[jpeg.length - 2] !== 0xff || jpeg[jpeg.length - 1] !== 0xd9) {
    throw new Error("Gambar sertifikat tidak valid.");
  }
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets = [0];
  let length = 0;
  const append = (value: string | Uint8Array) => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string) => {
    offsets[id] = length;
    append(`${id} 0 obj\n${body}\nendobj\n`);
  };
  append("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  append(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  append(jpeg);
  append("\nendstream\nendobj\n");
  const content = `q\n${PAGE_WIDTH} 0 0 ${PAGE_HEIGHT} 0 0 cm\n/Im0 Do\nQ\n`;
  object(5, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);
  const xref = length;
  append("xref\n0 6\n0000000000 65535 f \n");
  for (const offset of offsets.slice(1)) append(`${String(offset).padStart(10, "0")} 00000 n \n`);
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const result = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.length;
  }
  return result;
}

async function serializeCertificate(svg: SVGSVGElement): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  // Embed only this same-origin brand asset so SVG rasterization needs no external resources.
  for (const image of clone.querySelectorAll('image[href="/brand/hiru-bawah.png"]')) {
    const response = await fetch("/brand/hiru-bawah.png", { redirect: "error" });
    if (!response.ok) throw new Error("Logo HiruAcademy gagal dimuat.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 2 * 1024 * 1024) throw new Error("Logo HiruAcademy terlalu besar.");
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    image.setAttribute("href", `data:image/png;base64,${btoa(binary)}`);
  }
  // Only static certificate primitives; no CSS, scripts, foreign content or remote resources.
  const tags = new Set(["svg", "g", "title", "desc", "rect", "path", "text", "tspan", "image", "line", "circle", "ellipse", "polygon", "polyline"]);
  const attributes = new Set(["xmlns", "viewBox", "width", "height", "x", "y", "dx", "dy", "d", "points", "cx", "cy", "r", "rx", "ry", "x1", "x2", "y1", "y2", "fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity", "font-family", "font-size", "font-weight", "letter-spacing", "text-anchor", "textLength", "lengthAdjust", "transform", "preserveAspectRatio", "href"]);
  for (const element of [clone, ...clone.querySelectorAll("*")]) {
    if (element.namespaceURI !== "http://www.w3.org/2000/svg" || !tags.has(element.localName)) {
      throw new Error("Konten sertifikat tidak didukung.");
    }
    for (const attribute of [...element.attributes]) {
      if (["class", "id", "role"].includes(attribute.name) || attribute.name.startsWith("aria-")) {
        element.removeAttributeNode(attribute);
        continue;
      }
      if (!attributes.has(attribute.name) || /url\s*\(|\\|@import/i.test(attribute.value)) {
        throw new Error("Sumber eksternal pada sertifikat tidak diizinkan.");
      }
      if (attribute.name === "href") {
        const value = attribute.value;
        const payload = value.slice("data:image/png;base64,".length);
        if (element.localName !== "image" || !value.startsWith("data:image/png;base64,") || payload.length > 4 * Math.ceil(2 * 1024 * 1024 / 3) || payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) {
          throw new Error("Tanda tangan sertifikat harus berupa PNG tertanam.");
        }
        const bytes = atob(value.slice("data:image/png;base64,".length));
        if (![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes.charCodeAt(index) === byte)) {
          throw new Error("Tanda tangan PNG tidak valid.");
        }
      }
    }
  }
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", "2246");
  clone.setAttribute("height", "1588");
  return new XMLSerializer().serializeToString(clone);
}

/** Rejects on failure; caller owns user-facing error state. Does not mutate source SVG. */
export async function downloadCertificatePdf(svg: SVGSVGElement, filename: string): Promise<void> {
  const source = await serializeCertificate(svg);
  const svgUrl = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
  let pdfUrl: string | undefined;
  const link = document.createElement("a");
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Gambar sertifikat gagal dimuat."));
      image.src = svgUrl;
    });
    // ponytail: raster PDF keeps browser layout identical; use a vector renderer if selectable text is required.
    const canvas = document.createElement("canvas");
    canvas.width = 2246;
    canvas.height = 1588;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Browser tidak mendukung pembuatan sertifikat PDF.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Gagal membuat gambar sertifikat.")), "image/jpeg", 0.95);
    });
    const pdf = buildCertificatePdf(new Uint8Array(await jpeg.arrayBuffer()), canvas.width, canvas.height);
    pdfUrl = URL.createObjectURL(new Blob([pdf as Uint8Array<ArrayBuffer>], { type: "application/pdf" }));
    link.href = pdfUrl;
    const safeName = filename.replace(/\.pdf$/i, "").replace(/[^\p{L}\p{N} _-]/gu, "_").trim().slice(0, 120);
    link.download = `${safeName || "sertifikat"}.pdf`;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    // Keep URL alive through browser's download handoff, then release it before resolving.
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  } finally {
    link.remove();
    URL.revokeObjectURL(svgUrl);
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }
}

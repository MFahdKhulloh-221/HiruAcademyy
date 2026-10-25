import kuromoji from "kuromoji";
import path from "node:path";

export const runtime = "nodejs";
let tokenizer: Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> | undefined;
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 8192) return Response.json({}, { status: 413 });
  let text: unknown;
  try { ({ text } = await request.json()); } catch { return Response.json({}, { status: 400 }); }
  if (typeof text !== "string" || !text.trim() || text.length > 500) return Response.json({}, { status: 422 });
  try {
    tokenizer ??= new Promise((resolve, reject) => kuromoji.builder({ dicPath: path.join(process.cwd(), "node_modules/kuromoji/dict") }).build((error, result) => error ? reject(error) : resolve(result)));
    const tokens = (await tokenizer).tokenize(text);
    const uncertain = tokens.some(token => /[\p{Script=Han}々]/u.test(token.surface_form) && !token.reading);
    const reading = uncertain ? "" : tokens.map(token => (token.reading || token.surface_form).replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60))).join("");
    return Response.json({ reading });
  } catch { tokenizer = undefined; return Response.json({ reading: "" }); }
}

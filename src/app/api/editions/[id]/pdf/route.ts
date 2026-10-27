import { apiError, clientIp, log, rateLimit, tooMany } from "@/lib/api";
import { getReader } from "@/lib/auth/reader";
import { renderEditionPdf } from "@/lib/pdf/edition-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Small per-instance cache. Editions are immutable, so a key of id + filled-in analyses is exact.
const cache = new Map<string, Buffer>();

export async function GET(req: Request, ctx: RouteContext<"/api/editions/[id]/pdf">) {
  const { id } = await ctx.params;
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  const rl = rateLimit("pdf", reader.userId || clientIp(req));
  if (!rl.ok) return tooMany(rl.retryAfter);
  const edition = await reader.store.getEdition(reader.userId, id);
  if (!edition) return apiError(404, "Edition not found");

  const requested = new URL(req.url).searchParams.get("template");
  const template = requested === "briefing" || requested === "editorial" ? requested : ((await reader.store.getPreferences(reader.userId))?.pdfTemplate ?? "editorial");
  const version = `${edition.id}:${edition.stories.filter((s) => s.biggerPicture).length}:${template}`;
  const etag = `"${version}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag } });

  let pdf = cache.get(version);
  if (!pdf) {
    const started = Date.now();
    try {
      pdf = await renderEditionPdf(edition, { template });
    } catch (err) {
      log("pdf_failed", { edition: id, error: (err as Error).message?.slice(0, 200) });
      return apiError(500, "The PDF could not be generated. Please try again.");
    }
    log("pdf_rendered", { edition: id, bytes: pdf.length, ms: Date.now() - started });
    cache.set(version, pdf);
    if (cache.size > 25) cache.delete(cache.keys().next().value!);
  }
  const filename = `daybreak-${edition.editionDate}-edition-${edition.revision}${template === "briefing" ? "-briefing" : ""}.pdf`;
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "content-length": String(pdf.length),
      "cache-control": "private, max-age=300",
      etag,
      "x-daybreak-edition": edition.id,
    },
  });
}

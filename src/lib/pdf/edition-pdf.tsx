import path from "node:path";
import { Document, Font, Image, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { safeFetch } from "../security/safe-fetch";
import { safeLinkUrl } from "../security/url";
import { topicLabel } from "../topics";
import type { BiggerPicture, Edition, EditionStory } from "../types";

/**
 * Print edition. Rendered on demand from the SAVED edition only — no news search, no model
 * calls — so the PDF always matches the web edition with the same id.
 */

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
let fontsRegistered = false;

function registerFonts() {
  if (fontsRegistered) return;
  const f = (file: string) => path.join(FONT_DIR, file);
  Font.register({
    family: "Newsreader",
    fonts: [
      { src: f("newsreader-latin-400-normal.woff"), fontWeight: 400 },
      { src: f("newsreader-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
      { src: f("newsreader-latin-700-normal.woff"), fontWeight: 700 },
      { src: f("newsreader-latin-800-normal.woff"), fontWeight: 800 },
    ],
  });
  Font.register({
    family: "SourceSerif",
    fonts: [
      { src: f("source-serif-4-latin-400-normal.woff"), fontWeight: 400 },
      { src: f("source-serif-4-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
      { src: f("source-serif-4-latin-600-normal.woff"), fontWeight: 600 },
    ],
  });
  Font.register({
    family: "Inter",
    fonts: [
      { src: f("inter-latin-400-normal.woff"), fontWeight: 400 },
      { src: f("inter-latin-600-normal.woff"), fontWeight: 600 },
    ],
  });
  // Newspaper columns look better with whole words than with automatic hyphenation.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

/**
 * The embedded fonts cover Latin script. Fold accents and replace any remaining glyphs the
 * fonts lack, so the PDF never shows empty boxes.
 */
export function pdfText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFKC")
    .replace(/[\u00ad\u200b-\u200d\ufeff]/g, "")
    .replace(/[^\u0000-\u00ff\u0131\u0152\u0153\u02c6\u02dc\u2000-\u206f\u20ac\u2122\u2212]/g, (ch) => {
      const folded = ch.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
      return /^[\u0000-\u00ff]+$/.test(folded) ? folded : "";
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

const C = {
  ink: "#1b1a17",
  muted: "#5d5850",
  rule: "#c9c1b2",
  accent: "#7a1f2b",
  paper: "#fbf8f1",
  box: "#f2ece0",
};

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 54, paddingHorizontal: 42, backgroundColor: C.paper, color: C.ink, fontFamily: "SourceSerif", fontSize: 9.6, lineHeight: 1.38 },
  runningHead: { position: "absolute", top: 18, left: 42, right: 42, flexDirection: "row", justifyContent: "space-between", fontFamily: "Inter", fontSize: 7, color: C.muted, letterSpacing: 0.6 },
  footer: { position: "absolute", bottom: 22, left: 42, right: 42, flexDirection: "row", justifyContent: "space-between", fontFamily: "Inter", fontSize: 7, color: C.muted, borderTopWidth: 0.5, borderTopColor: C.rule, paddingTop: 5 },
  mastheadWrap: { alignItems: "center", marginBottom: 6 },
  masthead: { fontFamily: "Newsreader", fontWeight: 800, fontSize: 50, letterSpacing: 6, lineHeight: 1 },
  tagline: { fontFamily: "Newsreader", fontStyle: "italic", fontSize: 10.5, color: C.muted, marginTop: 3 },
  dateline: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1.6, borderBottomWidth: 0.6, borderColor: C.ink, paddingVertical: 4, marginTop: 8, marginBottom: 10, fontFamily: "Inter", fontSize: 7.5, letterSpacing: 0.4, textTransform: "uppercase" },
  banner: { fontFamily: "Inter", fontSize: 7.5, backgroundColor: C.box, padding: 6, marginBottom: 10, color: C.accent },
  intro: { fontFamily: "Newsreader", fontStyle: "italic", fontSize: 11.5, lineHeight: 1.4, marginBottom: 12, color: C.ink },
  kicker: { fontFamily: "Inter", fontWeight: 600, fontSize: 6.8, color: C.accent, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 },
  leadHeadline: { fontFamily: "Newsreader", fontWeight: 700, fontSize: 25, lineHeight: 1.08, marginBottom: 6 },
  headline: { fontFamily: "Newsreader", fontWeight: 700, fontSize: 13.5, lineHeight: 1.15, marginBottom: 3 },
  briefHeadline: { fontFamily: "Newsreader", fontWeight: 700, fontSize: 11, lineHeight: 1.18, marginBottom: 2 },
  meta: { fontFamily: "Inter", fontSize: 7, color: C.muted, marginBottom: 4 },
  why: { fontStyle: "italic", color: C.muted, marginTop: 3 },
  link: { fontFamily: "Inter", fontSize: 7, color: C.accent, textDecoration: "none", marginTop: 4 },
  sectionHead: { flexDirection: "row", alignItems: "flex-end", borderBottomWidth: 1.2, borderBottomColor: C.ink, marginTop: 14, marginBottom: 8, paddingBottom: 3 },
  sectionTitle: { fontFamily: "Newsreader", fontWeight: 800, fontSize: 15, letterSpacing: 0.4 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  col2: { width: "48.5%", marginBottom: 10, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: C.rule },
  col3: { width: "31.5%", paddingRight: 2 },
  front: { flexDirection: "row", justifyContent: "space-between" },
  frontLead: { width: "62%", paddingRight: 12, borderRightWidth: 0.5, borderRightColor: C.rule },
  frontSide: { width: "35%" },
  sideItem: { borderBottomWidth: 0.5, borderBottomColor: C.rule, paddingBottom: 7, marginBottom: 7 },
  sideHeadline: { fontFamily: "Newsreader", fontWeight: 700, fontSize: 12.5, lineHeight: 1.15, marginBottom: 3 },
  bp: { backgroundColor: C.box, padding: 9, marginTop: 10 },
  bpTitle: { fontFamily: "Newsreader", fontWeight: 700, fontSize: 11, marginBottom: 4 },
  bpLabel: { fontFamily: "Inter", fontWeight: 600, fontSize: 6.8, letterSpacing: 0.8, textTransform: "uppercase", color: C.muted, marginTop: 4 },
  things: { borderWidth: 0.8, borderColor: C.ink, padding: 10, marginTop: 14 },
  thingsTitle: { fontFamily: "Newsreader", fontWeight: 800, fontSize: 14, marginBottom: 6 },
  thing: { flexDirection: "row", marginBottom: 6 },
  thingNum: { fontFamily: "Newsreader", fontWeight: 800, fontSize: 18, color: C.accent, width: 18, lineHeight: 1 },
  about: { fontFamily: "Inter", fontSize: 7.2, color: C.muted, lineHeight: 1.45 },
  leadImage: { width: "100%", height: 170, objectFit: "cover", marginBottom: 6 },
  imageCredit: { fontFamily: "Inter", fontSize: 6.4, color: C.muted, marginBottom: 6 },
});

function when(iso: string | null): string {
  if (!iso) return "Time not given";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

function editionDateLong(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function Meta({ story }: { story: EditionStory }) {
  const a = story.article;
  return (
    <Text style={s.meta}>
      {pdfText(a.publisher)} · {when(a.publishedAt)}
      {a.sample ? " · SAMPLE DATA" : ""}
      {story.alsoReportedBy.length ? ` · Also: ${pdfText(story.alsoReportedBy.map((r) => r.publisher).join(", "))}` : ""}
    </Text>
  );
}

function SourceLink({ story }: { story: EditionStory }) {
  const href = safeLinkUrl(story.article.url);
  if (!href) return null;
  return (
    <Link src={href} style={s.link}>
      {story.article.sample ? "About this sample item →" : `Read the original at ${pdfText(story.article.publisher)} →`}
    </Link>
  );
}

function BiggerPictureBox({ bp, title }: { bp: BiggerPicture; title: string }) {
  return (
    <View style={s.bp} wrap={false}>
      <Text style={s.bpTitle}>{pdfText(title)}</Text>
      <Text style={s.bpLabel}>What happened</Text>
      <Text>{pdfText(bp.whatHappened)}</Text>
      {bp.whyItMatters ? (
        <>
          <Text style={s.bpLabel}>Why it matters</Text>
          <Text>{pdfText(bp.whyItMatters)}</Text>
        </>
      ) : null}
      {bp.background ? (
        <>
          <Text style={s.bpLabel}>Background</Text>
          <Text>{pdfText(bp.background)}</Text>
        </>
      ) : null}
      {bp.connections.length ? (
        <>
          <Text style={s.bpLabel}>Connections in today&apos;s edition</Text>
          {bp.connections.map((c) => (
            <Text key={c.articleId}>• {pdfText(c.title)} — {pdfText(c.relation)}</Text>
          ))}
        </>
      ) : null}
      {bp.whatChanged ? (
        <>
          <Text style={s.bpLabel}>Compared with earlier editions</Text>
          <Text>{pdfText(bp.whatChanged)}</Text>
        </>
      ) : null}
      {bp.watchNext ? (
        <>
          <Text style={s.bpLabel}>What to watch (interpretation)</Text>
          <Text>{pdfText(bp.watchNext)}</Text>
        </>
      ) : null}
      <Text style={s.bpLabel}>A question to ask</Text>
      <Text style={{ fontStyle: "italic" }}>{pdfText(bp.question)}</Text>
      <Text style={[s.meta, { marginTop: 5, marginBottom: 0 }]}>{bp.source === "ai" ? "AI-written from the cited reporting." : "Assembled from source descriptions and your saved editions; no AI text."} {bp.insufficient ? "Limited evidence available." : ""}</Text>
    </View>
  );
}

function StoryBlock({ story, compact }: { story: EditionStory; compact?: boolean }) {
  const a = story.article;
  return (
    <View style={s.col2} wrap={false}>
      <Text style={s.kicker}>{pdfText(topicLabel(a.topics[0] ?? "world"))}</Text>
      <Text style={compact ? s.briefHeadline : s.headline}>{pdfText(a.title)}</Text>
      <Meta story={story} />
      {story.summary ? <Text>{pdfText(compact ? story.summary.slice(0, 220) + (story.summary.length > 220 ? "…" : "") : story.summary)}</Text> : null}
      {!compact && story.whyItMatters ? <Text style={s.why}>{pdfText(story.whyItMatters)}</Text> : null}
      <SourceLink story={story} />
    </View>
  );
}

export interface PdfImage {
  data: Buffer;
  format: "jpg" | "png";
}

export function EditionDocument({ edition, leadImage }: { edition: Edition; leadImage: PdfImage | null }) {
  const stories = edition.stories;
  const lead = stories[0];
  const top = stories.filter((st) => st.tier === "top");
  const rest = edition.sections.filter((sec) => sec.id !== "front");
  const name = edition.readerName ? `Personal edition for ${edition.readerName}` : "Personal edition";
  return (
    <Document title={`DAYBREAK — ${edition.editionDate}`} author="DAYBREAK" subject={name} creator="DAYBREAK" producer="DAYBREAK">
      <Page size="A4" style={s.page}>
        <View style={s.runningHead} fixed render={({ pageNumber }) => (pageNumber > 1 ? <><Text>DAYBREAK</Text><Text>{editionDateLong(edition.editionDate)}</Text></> : null)} />
        <View style={s.mastheadWrap}>
          <Text style={s.masthead}>DAYBREAK</Text>
          <Text style={s.tagline}>The world, filtered through you.</Text>
        </View>
        <View style={s.dateline}>
          <Text>{editionDateLong(edition.editionDate)}</Text>
          <Text>{pdfText(name)}</Text>
          <Text>Edition {edition.revision} · {stories.length} stories</Text>
        </View>
        {edition.contentMode === "sample" ? (
          <Text style={s.banner}>SAMPLE EDITION — built from clearly labelled demonstration data, not live news. Configure network access to news feeds for a live edition.</Text>
        ) : null}
        <Text style={s.intro}>{pdfText(edition.intro)}</Text>

        <View style={s.front}>
          {lead ? (
            <View style={s.frontLead}>
              <Text style={s.kicker}>Lead story · {pdfText(topicLabel(lead.article.topics[0] ?? "world"))}</Text>
              <Text style={s.leadHeadline}>{pdfText(lead.article.title)}</Text>
              {leadImage ? (
                <>
                  {/* react-pdf images have no alt attribute; the credit line below describes the image. */}
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <Image src={leadImage} style={s.leadImage} />
                  <Text style={s.imageCredit}>Image: {pdfText(lead.article.publisher)}, via its news feed</Text>
                </>
              ) : null}
              <Meta story={lead} />
              <Text style={{ fontSize: 10.4 }}>{pdfText(lead.summary)}</Text>
              {lead.whyItMatters ? <Text style={s.why}>{pdfText(lead.whyItMatters)}</Text> : null}
              <SourceLink story={lead} />
            </View>
          ) : null}
          {top.length ? (
            <View style={s.frontSide}>
              {top.map((st, i) => (
                <View key={st.position} style={i < top.length - 1 ? s.sideItem : undefined} wrap={false}>
                  <Text style={s.kicker}>{pdfText(topicLabel(st.article.topics[0] ?? "world"))}</Text>
                  <Text style={s.sideHeadline}>{pdfText(st.article.title)}</Text>
                  <Meta story={st} />
                  <Text>{pdfText(st.summary.length > 260 ? `${st.summary.slice(0, 257)}…` : st.summary)}</Text>
                  <SourceLink story={st} />
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {lead?.biggerPicture ? <BiggerPictureBox bp={lead.biggerPicture} title={`The Bigger Picture: ${lead.article.title}`} /> : null}

        {edition.threeThings.length ? (
          <View style={s.things} wrap={false}>
            <Text style={s.thingsTitle}>Three Things to Remember</Text>
            {edition.threeThings.map((t, i) => (
              <View key={i} style={s.thing}>
                <Text style={s.thingNum}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: 600 }}>{pdfText(t.headline)}</Text>
                  <Text>{pdfText(t.fact)}</Text>
                  {t.interpretation ? <Text style={s.why}>Interpretation: {pdfText(t.interpretation)}</Text> : null}
                  {t.regionalNote ? <Text style={s.why}>{pdfText(t.regionalNote)}</Text> : null}
                </View>
              </View>
            ))}
            <Text style={[s.meta, { marginBottom: 0 }]}>{edition.threeThings.some((t) => t.source === "ai") ? "Facts are drawn from the linked stories; interpretation is labelled." : "Drawn directly from the publishers' descriptions."}</Text>
          </View>
        ) : null}

        {rest.map((sec) => {
          const items = sec.positions.map((p) => stories[p]).filter((st): st is EditionStory => Boolean(st));
          return (
            <View key={sec.id}>
              {/* The heading travels with the first row so it is never stranded at the foot of a page. */}
              <View wrap={false}>
                <View style={s.sectionHead}>
                  <Text style={s.sectionTitle}>{pdfText(sec.title)}</Text>
                </View>
                <View style={s.grid}>
                  {items.slice(0, 2).map((st) => (
                    <StoryBlock key={st.position} story={st} compact={st.tier === "brief"} />
                  ))}
                </View>
              </View>
              <View style={s.grid}>
                {items.slice(2).map((st) => (
                  <StoryBlock key={st.position} story={st} compact={st.tier === "brief"} />
                ))}
              </View>
              {items.filter((st) => st.biggerPicture).map((st) => (
                <BiggerPictureBox key={`bp-${st.position}`} bp={st.biggerPicture!} title={`The Bigger Picture: ${st.article.title}`} />
              ))}
            </View>
          );
        })}

        <View style={{ marginTop: 16 }} wrap={false}>
          <View style={s.sectionHead}>
            <Text style={[s.sectionTitle, { fontSize: 11 }]}>About this edition</Text>
          </View>
          <Text style={s.about}>
            Edition {edition.id} · {edition.editionDate} · revision {edition.revision} · prepared {when(edition.createdAt)}. Stories were selected by DAYBREAK&apos;s ranking ({edition.ranking.version}) from {edition.ranking.candidateCount} candidate articles using your saved preferences{edition.ranking.feedbackSignals ? ` and ${edition.ranking.feedbackSignals} feedback signals` : ""}.{" "}
            {edition.ai.used ? `Summaries and analysis were written by ${edition.ai.model} and checked against the source text; publisher facts are linked for verification.` : "No AI text was used: summaries are the publishers' own descriptions."} Every headline links to the original reporting; DAYBREAK does not reproduce full articles.
          </Text>
        </View>

        <View style={s.footer} fixed>
          <Text>DAYBREAK · {edition.editionDate} · edition {edition.id.slice(0, 8)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** Fetch the lead image for print: JPEG/PNG only, size-capped, SSRF-checked, short timeout. */
export async function fetchPdfImage(url: string | null): Promise<PdfImage | null> {
  if (!url) return null;
  try {
    const res = await safeFetch(url, { timeoutMs: 4000, maxBytes: 2_500_000, accept: ["image/jpeg", "image/jpg", "image/png"] });
    if (res.status !== 200) return null;
    const type = res.headers.get("content-type") ?? "";
    const b = res.body;
    const isPng = b[0] === 0x89 && b[1] === 0x50;
    const isJpg = b[0] === 0xff && b[1] === 0xd8;
    if (!isPng && !isJpg) return null;
    return { data: b, format: isPng || type.includes("png") ? "png" : "jpg" };
  } catch {
    return null;
  }
}

export async function renderEditionPdf(edition: Edition, opts: { images?: boolean } = {}): Promise<Buffer> {
  registerFonts();
  const leadImage = opts.images === false ? null : await fetchPdfImage(edition.stories[0]?.article.imageUrl ?? null);
  return renderToBuffer(<EditionDocument edition={edition} leadImage={leadImage} />);
}

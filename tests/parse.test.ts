import { describe, expect, it } from "vitest";
import { FeedParseError, parseFeed } from "@/lib/news/parse";

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><title>Example</title>
<item>
  <title><![CDATA[Floods close schools in three districts]]></title>
  <link>https://news.example.com/floods?utm_source=rss&amp;id=7</link>
  <description>&lt;p&gt;Heavy rain forced &lt;b&gt;closures&lt;/b&gt;.&lt;/p&gt;</description>
  <pubDate>Fri, 16 Oct 26 21:47:32 +0500</pubDate>
  <dc:creator><![CDATA[A. Reporter]]></dc:creator>
  <category>Climate</category><category>Education</category>
  <media:content url="https://img.example.com/small.jpg" width="140" medium="image"/>
  <media:content url="https://img.example.com/large.jpg" width="960" medium="image"/>
</item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Example</title>
<entry>
  <title type="html"><![CDATA[Chipmaker reports record demand]]></title>
  <link rel="alternate" type="text/html" href="https://tech.example.com/chips"/>
  <published>2026-10-16T19:36:26-04:00</published>
  <author><name>Staff</name></author>
  <category term="Tech"/>
  <summary type="html"><![CDATA[Orders doubled. <img src="https://img.example.com/chip.png"/>]]></summary>
</entry>
</feed>`;

describe("parseFeed", () => {
  it("parses RSS 2.0 with CDATA, encoded HTML, media and categories", () => {
    const feed = parseFeed(RSS);
    expect(feed.format).toBe("rss");
    const item = feed.items[0]!;
    expect(item.title).toBe("Floods close schools in three districts");
    expect(item.link).toBe("https://news.example.com/floods?utm_source=rss&id=7");
    expect(item.author).toBe("A. Reporter");
    expect(item.categories).toEqual(["Climate", "Education"]);
    expect(item.imageCandidates.map((c) => c.width)).toContain(960);
    expect(item.published).toContain("16 Oct 26");
  });

  it("parses Atom feeds", () => {
    const feed = parseFeed(ATOM);
    expect(feed.format).toBe("atom");
    expect(feed.items[0]!.link).toBe("https://tech.example.com/chips");
    expect(feed.items[0]!.categories).toEqual(["Tech"]);
    expect(feed.items[0]!.imageCandidates[0]!.url).toBe("https://img.example.com/chip.png");
  });

  it("rejects documents that are not feeds", () => {
    expect(() => parseFeed("<html><body>hi</body></html>")).toThrow(FeedParseError);
  });

  it("neutralises DOCTYPE entity expansion", () => {
    const evil = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;">]><rss><channel><item><title>&lol2;</title><link>https://x.example.com/a</link></item></channel></rss>`;
    const feed = parseFeed(evil);
    expect(feed.items[0]!.title).not.toContain("lollol");
  });
});

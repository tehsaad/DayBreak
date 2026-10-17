# Sample data

DAYBREAK ships a small set of **fictional, clearly labelled demonstration items** in
[`src/lib/news/sample.ts`](../src/lib/news/sample.ts). They exist so the product and its tests work
without network access. They are **not news**.

They are used only when:

- `NEWS_MODE=sample` is set (offline demos, automated tests), or
- live feeds could not be reached **and** there are fewer than 8 stored live articles.

Whenever they appear:

- the publisher is shown as "Sample Wire (demo data)" or "Sample Ledger (demo data)";
- each story carries a **Sample** badge, and the edition carries a "Sample edition" banner on the web and in the PDF;
- the "link" points to this page, not to a real article.

Sample items have no real publishers, dates, people or events. Do not cite them.

<a id="s01"></a><a id="s02"></a><a id="s03"></a><a id="s04"></a><a id="s05"></a><a id="s06"></a><a id="s07"></a><a id="s08"></a><a id="s09"></a><a id="s10"></a><a id="s11"></a><a id="s12"></a><a id="s13"></a><a id="s14"></a><a id="s15"></a><a id="s16"></a><a id="s17"></a><a id="s18"></a><a id="s19"></a><a id="s20"></a><a id="s21"></a><a id="s22"></a><a id="s23"></a><a id="s24"></a><a id="s25"></a><a id="s26"></a><a id="s27"></a><a id="s28"></a><a id="s29"></a><a id="s30"></a><a id="s31"></a><a id="s32"></a><a id="s33"></a><a id="s34"></a><a id="s35"></a><a id="s36"></a>

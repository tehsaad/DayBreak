import type { EditionStory, KnowledgeItem } from "@/lib/types";

export function ThreeThings({ items, stories, onJump }: { items: KnowledgeItem[]; stories: EditionStory[]; onJump: (articleId: string) => void }) {
  const titleOf = (id: string) => stories.find((s) => s.article.id === id)?.article;
  const anyAi = items.some((i) => i.source === "ai");
  return (
    <section aria-labelledby="three-things" className="mt-12 border-y-2 border-ink bg-paper-card px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="three-things" className="font-display text-3xl font-extrabold">Three Things to Remember</h2>
        <p className="meta">{anyAi ? "Facts come from the linked stories; interpretation is labelled." : "Taken directly from the publishers' descriptions."}</p>
      </div>
      <ol className="mt-5 grid gap-6 md:grid-cols-3">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3 md:block">
            <span aria-hidden className="font-display text-5xl font-extrabold leading-none text-accent">{i + 1}</span>
            <div className="md:mt-2">
              <h3 className="headline text-xl">{item.headline}</h3>
              <p className="mt-2 leading-relaxed text-ink-soft">{item.fact}</p>
              {item.interpretation ? (
                <p className="mt-2 text-sm italic text-muted">
                  <span className="not-italic font-sans text-[0.68rem] font-semibold uppercase tracking-wider text-warn">Interpretation · </span>
                  {item.interpretation}
                </p>
              ) : null}
              {item.regionalNote ? <p className="mt-2 font-sans text-xs text-forest">{item.regionalNote}</p> : null}
              <p className="mt-2 font-sans text-xs text-muted">
                From:{" "}
                {item.articleIds.map((id, j) => {
                  const a = titleOf(id);
                  return a ? (
                    <span key={id}>
                      {j ? "; " : ""}
                      <button type="button" className="no-print underline decoration-rule underline-offset-2 hover:decoration-ink" onClick={() => onJump(id)}>
                        {a.publisher}
                      </button>
                    </span>
                  ) : null;
                })}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

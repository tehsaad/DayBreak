export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="mx-auto h-16 w-80 max-w-full skeleton" />
      <div className="mt-6 h-1.5 skeleton" />
      <div className="mt-10 grid gap-8 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-8">
          <div className="h-10 w-11/12 skeleton" />
          <div className="h-10 w-8/12 skeleton" />
          <div className="mt-4 aspect-[16/9] skeleton" />
          <div className="h-4 w-full skeleton" />
          <div className="h-4 w-10/12 skeleton" />
        </div>
        <div className="space-y-6 lg:col-span-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-6 w-full skeleton" />
              <div className="h-4 w-9/12 skeleton" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

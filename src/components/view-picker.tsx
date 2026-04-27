import Link from "next/link";
import { DESK_VIEWS } from "@/lib/views";

export function ViewPicker({ currentSlug }: { currentSlug: string }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1 shadow-sm">
      {DESK_VIEWS.map((v) => {
        const active = v.slug === currentSlug;
        return (
          <Link
            key={v.slug}
            href={{ pathname: "/", query: { view: v.slug } }}
            scroll={false}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-brand-coral text-white"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {v.label}
            <span
              className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                active
                  ? "bg-white/20 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {v.expectedCount.toLocaleString()}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

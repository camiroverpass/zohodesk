export type DeskView = {
  slug: string;
  label: string;
  viewId: string;
  expectedCount: number;
};

export const DESK_VIEWS: DeskView[] = [
  {
    slug: "campground",
    label: "Campground Tickets",
    viewId: "1177001000000640038",
    expectedCount: 48,
  },
  {
    slug: "camper",
    label: "Camper Tickets",
    viewId: "1177001000000640146",
    expectedCount: 23,
  },
  {
    slug: "campground-complete",
    label: "Campground Complete",
    viewId: "1177001000017836608",
    expectedCount: 23305,
  },
  {
    slug: "camper-complete",
    label: "Camper Complete",
    viewId: "1177001000017871752",
    expectedCount: 778,
  },
];

export const DEFAULT_VIEW = DESK_VIEWS[0];

export function findViewBySlug(slug: string | undefined | null): DeskView {
  if (!slug) return DEFAULT_VIEW;
  return DESK_VIEWS.find((v) => v.slug === slug) ?? DEFAULT_VIEW;
}

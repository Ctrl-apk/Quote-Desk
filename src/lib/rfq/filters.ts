import type { RfqStatusValue } from "./overdue";

export const RFQ_STATUSES: readonly RfqStatusValue[] = ["estimating", "sent", "won", "lost"];
export const MAX_SEARCH_LENGTH = 80;

export const RFQ_SORT_KEYS = ["due", "received", "customer", "rfq"] as const;
export type RfqSortKey = (typeof RFQ_SORT_KEYS)[number];
export type SortDir = "asc" | "desc";
/** Due soonest first is the working order; received defaults to newest first. */
export const defaultDir = (sort: RfqSortKey): SortDir => (sort === "received" ? "desc" : "asc");

export interface RfqFilters {
  sort: RfqSortKey;
  dir: SortDir;
  /** Only RFQs owned by the signed-in user. */
  mine: boolean;
  status: RfqStatusValue | null;
  /** Free text matched against RFQ number, customer and part name. */
  q: string;
}

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Reads filters from the URL. Anything unexpected is ignored rather than rejected, so a
 * hand-edited or stale link still opens the register.
 */
export function parseRfqFilters(params: Params): RfqFilters {
  const status = first(params.status);
  const q = (first(params.q) ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH_LENGTH);
  const sortParam = first(params.sort);
  const sort = RFQ_SORT_KEYS.includes(sortParam as RfqSortKey) ? (sortParam as RfqSortKey) : "due";
  const dirParam = first(params.dir);
  return {
    sort,
    dir: dirParam === "asc" || dirParam === "desc" ? dirParam : defaultDir(sort),
    mine: first(params.scope) === "mine",
    status: RFQ_STATUSES.includes(status as RfqStatusValue) ? (status as RfqStatusValue) : null,
    q,
  };
}

/** The reverse: the query string for a set of filters, omitting defaults. */
export function rfqFiltersToQuery(f: RfqFilters): string {
  const p = new URLSearchParams();
  if (f.mine) p.set("scope", "mine");
  if (f.status) p.set("status", f.status);
  if (f.q) p.set("q", f.q);
  if (f.sort !== "due") p.set("sort", f.sort);
  if (f.dir !== defaultDir(f.sort)) p.set("dir", f.dir);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** The filters with the search, scope and status cleared. The sort order is kept. */
export const clearedFilters = (f: RfqFilters): RfqFilters => ({ ...f, mine: false, status: null, q: "" });

/** Clicking a column: sort by it (in its default direction), or flip the direction if it is already the sort. */
export function toggleSort(f: RfqFilters, key: RfqSortKey): RfqFilters {
  return f.sort === key ? { ...f, dir: f.dir === "asc" ? "desc" : "asc" } : { ...f, sort: key, dir: defaultDir(key) };
}

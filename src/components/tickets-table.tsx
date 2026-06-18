"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { LastActivity, Ticket } from "@/lib/zoho";
import type { Suggestion, Confidence } from "@/lib/classify";
import {
  changeProblemForTickets,
  getLastActivitiesForTickets,
  suggestTagsForTickets,
} from "@/app/actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const NONE_VALUE = "__none__";
const ALL_VALUE = "__all__";
const CUSTOM_VALUE = "__custom__";

type Props = {
  tickets: Ticket[];
  knownProblems: string[];
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function contactName(t: Ticket) {
  if (!t.contact) return "—";
  const name = [t.contact.firstName, t.contact.lastName].filter(Boolean).join(" ").trim();
  return name || t.contact.email || "—";
}

function problemTags(t: Ticket): string[] {
  if (!t.problem) return [];
  return t.problem.split(";").map((s) => s.trim()).filter(Boolean);
}

function Pill({
  active,
  onClick,
  children,
  tone = "default",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "default" | "coral" | "green" | "amber";
}) {
  const baseActive =
    tone === "coral"
      ? "bg-brand-coral text-white border-brand-coral"
      : tone === "green"
        ? "bg-brand-green text-white border-brand-green"
        : tone === "amber"
          ? "bg-brand-amber text-white border-brand-amber"
          : "bg-foreground text-background border-foreground";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? baseActive
          : "border-border bg-card text-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

const RED_PROBLEMS = new Set(["other", "none", "spam"]);

const PROBLEM_TONE_CLASSES = {
  coral: "bg-brand-coral/10 text-brand-coral",
  amber: "bg-brand-amber/15 text-[color:var(--brand-amber)]",
  green: "bg-brand-green/15 text-brand-green",
  navy: "bg-brand-navy/10 text-brand-navy",
  slate: "bg-slate-100 text-slate-700",
} as const;

type ProblemTone = keyof typeof PROBLEM_TONE_CLASSES;

function problemTone(value: string): ProblemTone {
  const v = value.trim().toLowerCase();
  if (RED_PROBLEMS.has(v)) return "coral";
  const palette: ProblemTone[] = ["amber", "green", "navy", "slate"];
  let hash = 0;
  for (let i = 0; i < v.length; i++) hash = (hash * 31 + v.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

function ProblemBadge({ value }: { value: string }) {
  const tone = problemTone(value);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PROBLEM_TONE_CLASSES[tone]}`}
    >
      {value}
    </span>
  );
}

const CONFIDENCE_CLASSES: Record<Confidence, string> = {
  high: "bg-brand-green/15 text-brand-green",
  medium: "bg-brand-amber/15 text-[color:var(--brand-amber)]",
  low: "bg-slate-100 text-slate-600",
};

function ConfidencePill({ c }: { c: Confidence }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${CONFIDENCE_CLASSES[c]}`}
    >
      {c}
    </span>
  );
}

const MAX_SUGGEST = 60;

type ActivityState = LastActivity | "loading" | "error";

function activityLabel(a: LastActivity): string {
  if (a.type === "thread") {
    const channel = a.channel ? a.channel.toLowerCase() : "email";
    if (a.direction === "in") return `${channel} from customer`;
    if (a.direction === "out") return `${channel} to customer`;
    return channel;
  }
  if (a.type === "comment") {
    return a.isPublic === false ? "private comment" : "comment";
  }
  return "activity";
}

function activityToneClass(a: LastActivity): string {
  if (a.type === "comment") {
    return a.isPublic === false
      ? "bg-brand-amber/15 text-[color:var(--brand-amber)]"
      : "bg-brand-navy/10 text-brand-navy";
  }
  if (a.type === "thread") {
    return a.direction === "in"
      ? "bg-brand-coral/10 text-brand-coral"
      : "bg-brand-green/15 text-brand-green";
  }
  return "bg-slate-100 text-slate-700";
}

function ActivityPreview({ activity }: { activity: LastActivity }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${activityToneClass(activity)}`}
        >
          {activityLabel(activity)}
        </span>
        {activity.authorName ? (
          <span className="truncate text-[11px] text-muted-foreground" title={activity.authorName}>
            {activity.authorName}
          </span>
        ) : null}
      </div>
      <p
        className="line-clamp-2 text-xs text-foreground/80"
        title={activity.preview || undefined}
      >
        {activity.preview || <span className="italic text-muted-foreground">No content</span>}
      </p>
    </div>
  );
}

function LastActivityCell({
  ticketId,
  state,
  onVisible,
}: {
  ticketId: string;
  state: ActivityState | undefined;
  onVisible: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (state !== undefined) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onVisible(ticketId);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [state, ticketId, onVisible]);

  if (state === undefined) {
    return (
      <div ref={ref} className="text-xs italic text-muted-foreground">
        …
      </div>
    );
  }
  if (state === "loading") {
    return <div className="text-xs italic text-muted-foreground">Loading…</div>;
  }
  if (state === "error") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return <ActivityPreview activity={state} />;
}

export function TicketsTable({ tickets, knownProblems }: Props) {
  const [filter, setFilter] = useState<string>(ALL_VALUE);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetProblem, setTargetProblem] = useState<string>(knownProblems[0] ?? "");
  const [customProblem, setCustomProblem] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ updated: number; failed: number } | null>(null);
  const [activities, setActivities] = useState<Map<string, ActivityState>>(new Map());
  const [suggestions, setSuggestions] = useState<Map<string, Suggestion>>(new Map());
  const [isSuggesting, startSuggest] = useTransition();
  const [isApplying, startApply] = useTransition();
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const requestedRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestActivity = useCallback((id: string) => {
    if (requestedRef.current.has(id)) return;
    requestedRef.current.add(id);
    pendingRef.current.add(id);
    setActivities((prev) => {
      const next = new Map(prev);
      next.set(id, "loading");
      return next;
    });
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(async () => {
      const ids = Array.from(pendingRef.current);
      pendingRef.current.clear();
      flushTimerRef.current = null;
      if (!ids.length) return;
      try {
        const result = await getLastActivitiesForTickets(ids);
        setActivities((prev) => {
          const next = new Map(prev);
          for (const id of ids) {
            const value = result[id];
            next.set(id, value ?? "error");
          }
          return next;
        });
      } catch {
        setActivities((prev) => {
          const next = new Map(prev);
          for (const id of ids) next.set(id, "error");
          return next;
        });
      }
    }, 200);
  }, []);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (filter === NONE_VALUE) {
        if (t.problem && t.problem.trim()) return false;
      } else if (filter !== ALL_VALUE) {
        const tags = problemTags(t);
        if (!tags.includes(filter)) return false;
      }
      if (!q) return true;
      const hay = [
        t.subject,
        t.ticketNumber,
        contactName(t),
        t.contact?.email ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [tickets, filter, search]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((t) => selected.has(t.id));
  const someFilteredSelected = filtered.some((t) => selected.has(t.id));

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllFiltered(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) filtered.forEach((t) => next.add(t.id));
      else filtered.forEach((t) => next.delete(t.id));
      return next;
    });
  }

  function handleBulkChange() {
    const value =
      targetProblem === CUSTOM_VALUE
        ? customProblem.trim()
        : targetProblem === NONE_VALUE
          ? ""
          : targetProblem;
    const ids = Array.from(selected);
    if (!ids.length) return;

    startTransition(async () => {
      const r = await changeProblemForTickets(ids, value);
      setResult({ updated: r.updated, failed: r.failed.length });
      setSelected(new Set());
      setDialogOpen(false);
    });
  }

  const suggestTargets = filtered.slice(0, MAX_SUGGEST);
  const highConfCount = filtered.filter(
    (t) => suggestions.get(t.id)?.confidence === "high",
  ).length;

  function handleSuggest() {
    const targets = suggestTargets.map((t) => ({ id: t.id, subject: t.subject }));
    if (!targets.length) return;
    startSuggest(async () => {
      const res = await suggestTagsForTickets(targets);
      setSuggestions((prev) => {
        const next = new Map(prev);
        for (const [id, s] of Object.entries(res)) next.set(id, s);
        return next;
      });
    });
  }

  function applyOne(id: string, category: string) {
    setApplyingId(id);
    startApply(async () => {
      await changeProblemForTickets([id], category);
      setApplyingId(null);
      setSuggestions((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    });
  }

  function applyHighConfidence() {
    const items = filtered.filter((t) => suggestions.get(t.id)?.confidence === "high");
    if (!items.length) return;
    startApply(async () => {
      const byCategory = new Map<string, string[]>();
      for (const t of items) {
        const s = suggestions.get(t.id);
        if (!s) continue;
        const arr = byCategory.get(s.category) ?? [];
        arr.push(t.id);
        byCategory.set(s.category, arr);
      }
      for (const [category, ids] of byCategory) {
        await changeProblemForTickets(ids, category);
      }
      setSuggestions((prev) => {
        const next = new Map(prev);
        for (const t of items) next.delete(t.id);
        return next;
      });
    });
  }

  const fromLabel =
    filter === NONE_VALUE ? "-None-" : filter === ALL_VALUE ? "any value" : filter;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <div>
              <Label className="mb-1 block text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Search
              </Label>
              <Input
                placeholder="Subject, customer, ticket #…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div>
              <Label className="mb-2 block text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Quick filter
              </Label>
              <div className="flex flex-wrap gap-2">
                <Pill
                  active={filter === ALL_VALUE}
                  onClick={() => setFilter(ALL_VALUE)}
                  tone="coral"
                >
                  All
                </Pill>
                <Pill
                  active={filter === NONE_VALUE}
                  onClick={() => setFilter(NONE_VALUE)}
                  tone="coral"
                >
                  -None- (no problem)
                </Pill>
                {knownProblems.slice(0, 6).map((p) => (
                  <Pill
                    key={p}
                    active={filter === p}
                    onClick={() => setFilter(p)}
                    tone="coral"
                  >
                    {p}
                  </Pill>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:w-64">
            <Label className="mb-1 block text-xs font-medium uppercase tracking-widest text-muted-foreground">
              All problems
            </Label>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All tickets</SelectItem>
                <SelectItem value={NONE_VALUE}>-None- (no problem set)</SelectItem>
                {knownProblems.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {result ? (
        <div className="rounded-lg border border-brand-green/30 bg-brand-green/5 px-4 py-3 text-sm text-brand-green">
          Updated {result.updated} ticket{result.updated === 1 ? "" : "s"}.
          {result.failed > 0 ? (
            <span className="ml-2 text-destructive"> {result.failed} failed.</span>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-lg border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Ticket cheatsheet</h2>
            <p className="text-xs text-muted-foreground">
              {selected.size > 0
                ? `${selected.size} selected · ${filtered.length} shown`
                : `${filtered.length} ticket${filtered.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleSuggest}
              disabled={isSuggesting || filtered.length === 0}
              title={`Classify the ${suggestTargets.length} shown ticket${suggestTargets.length === 1 ? "" : "s"} with AI (read-only)`}
            >
              {isSuggesting ? "Suggesting…" : `Suggest tags (AI) · ${suggestTargets.length}`}
            </Button>
            {highConfCount > 0 ? (
              <Button variant="outline" onClick={applyHighConfidence} disabled={isApplying}>
                {isApplying ? "Applying…" : `Apply ${highConfCount} high-confidence`}
              </Button>
            ) : null}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button disabled={selected.size === 0}>Change problem…</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Change problem</DialogTitle>
                  <DialogDescription>
                    Change problem for {selected.size} ticket
                    {selected.size === 1 ? "" : "s"} from{" "}
                    <strong>{fromLabel}</strong> to:
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                  <Select value={targetProblem} onValueChange={setTargetProblem}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select new problem" />
                    </SelectTrigger>
                    <SelectContent>
                      {knownProblems.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                      <SelectItem value={NONE_VALUE}>Clear (-None-)</SelectItem>
                      <SelectItem value={CUSTOM_VALUE}>Custom value…</SelectItem>
                    </SelectContent>
                  </Select>

                  {targetProblem === CUSTOM_VALUE ? (
                    <Input
                      placeholder="Type problem value (semicolon-separate for multi)"
                      value={customProblem}
                      onChange={(e) => setCustomProblem(e.target.value)}
                    />
                  ) : null}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleBulkChange}
                    disabled={
                      isPending ||
                      (targetProblem === CUSTOM_VALUE && !customProblem.trim())
                    }
                  >
                    {isPending ? "Updating…" : "Apply"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    allFilteredSelected
                      ? true
                      : someFilteredSelected
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(v) => toggleAllFiltered(v === true)}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="w-24 text-xs uppercase tracking-widest text-muted-foreground">
                Ticket #
              </TableHead>
              <TableHead className="text-xs uppercase tracking-widest text-muted-foreground">
                Subject
              </TableHead>
              <TableHead className="w-[240px] text-xs uppercase tracking-widest text-muted-foreground">
                Customer
              </TableHead>
              <TableHead className="w-[320px] text-xs uppercase tracking-widest text-muted-foreground">
                Last activity
              </TableHead>
              <TableHead className="w-32 text-xs uppercase tracking-widest text-muted-foreground">
                Date
              </TableHead>
              <TableHead className="text-xs uppercase tracking-widest text-muted-foreground">
                Problem
              </TableHead>
              <TableHead className="w-[240px] text-xs uppercase tracking-widest text-muted-foreground">
                AI suggestion
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No tickets match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((t) => {
                const tags = problemTags(t);
                const isSelected = selected.has(t.id);
                return (
                  <TableRow key={t.id} data-state={isSelected ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(v) => toggleOne(t.id, v === true)}
                        aria-label={`Select ticket ${t.ticketNumber}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <a
                        href={t.webUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-coral hover:underline"
                      >
                        {t.ticketNumber}
                      </a>
                    </TableCell>
                    <TableCell className="max-w-[420px] truncate">{t.subject}</TableCell>
                    <TableCell className="max-w-[240px]">
                      <div className="leading-tight">
                        <div className="truncate" title={contactName(t)}>
                          {contactName(t)}
                        </div>
                        {t.contact?.email ? (
                          <div
                            className="truncate text-xs text-muted-foreground"
                            title={t.contact.email}
                          >
                            {t.contact.email}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[320px] align-top">
                      <LastActivityCell
                        ticketId={t.id}
                        state={activities.get(t.id)}
                        onVisible={requestActivity}
                      />
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(t.createdTime)}</TableCell>
                    <TableCell>
                      {tags.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {tags.map((tag) => (
                            <ProblemBadge key={tag} value={tag} />
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[240px] align-top">
                      {(() => {
                        const sug = suggestions.get(t.id);
                        if (!sug) return <span className="text-xs text-muted-foreground">—</span>;
                        return (
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5" title={sug.reason}>
                              <ProblemBadge value={sug.category} />
                              <ConfidencePill c={sug.confidence} />
                            </div>
                            <button
                              type="button"
                              onClick={() => applyOne(t.id, sug.category)}
                              disabled={isApplying}
                              className="text-[11px] font-medium text-brand-coral hover:underline disabled:opacity-50"
                            >
                              {applyingId === t.id ? "Applying…" : "Apply"}
                            </button>
                          </div>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import type { Ticket } from "@/lib/zoho";
import { changeProblemForTickets } from "@/app/actions";
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

export function TicketsTable({ tickets, knownProblems }: Props) {
  const [filter, setFilter] = useState<string>(ALL_VALUE);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetProblem, setTargetProblem] = useState<string>(knownProblems[0] ?? "");
  const [customProblem, setCustomProblem] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ updated: number; failed: number } | null>(null);

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
              <TableHead className="w-32 text-xs uppercase tracking-widest text-muted-foreground">
                Date
              </TableHead>
              <TableHead className="text-xs uppercase tracking-widest text-muted-foreground">
                Problem
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
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

import { listAllTickets } from "@/lib/zoho";
import { TicketsTable } from "@/components/tickets-table";
import { cookies } from "next/headers";
import { AUTH_COOKIE } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function logout() {
  "use server";
  const jar = await cookies();
  jar.delete(AUTH_COOKIE);
  redirect("/login");
}

async function refresh() {
  "use server";
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/");
}

export default async function Page() {
  const departmentId = process.env.ZOHO_DEPARTMENT_ID;
  let tickets: Awaited<ReturnType<typeof listAllTickets>> = [];
  let loadError: string | null = null;

  try {
    tickets = await listAllTickets({
      departmentId: departmentId || undefined,
      max: 3000,
    });
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  const problems = Array.from(
    new Set(
      tickets
        .flatMap((t) => (t.problem ? t.problem.split(";").map((p) => p.trim()) : []))
        .filter(Boolean),
    ),
  ).sort();

  const totalTickets = tickets.length;
  const noneCount = tickets.filter((t) => !t.problem).length;
  const taggedCount = totalTickets - noneCount;
  const distinctProblems = problems.length;

  return (
    <div className="min-h-screen bg-background">
      <div className="h-1 w-full bg-brand-green" />

      <div className="mx-auto max-w-[1400px] px-6 py-6">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-coral text-lg font-semibold text-white shadow-sm">
              R
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">RoverPass</h1>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Tickets Dashboard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-green/10 px-3 py-1.5 text-xs font-medium text-brand-green">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-green opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-green" />
              </span>
              Live · Updated just now
            </span>
            <form action={refresh}>
              <button
                type="submit"
                className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-muted"
              >
                Refresh
              </button>
            </form>
            <form action={logout}>
              <button
                type="submit"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        {loadError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Failed to load tickets: {loadError}
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Total Tickets" value={totalTickets} />
              <KpiCard
                label="No Problem Set"
                value={noneCount}
                tone="coral"
                sub="-None- in Zoho"
              />
              <KpiCard
                label="Tagged"
                value={taggedCount}
                tone="green"
                sub={
                  totalTickets
                    ? `${Math.round((taggedCount / totalTickets) * 100)}% of tickets`
                    : undefined
                }
              />
              <KpiCard
                label="Distinct Problems"
                value={distinctProblems}
                tone="navy"
              />
            </div>

            <TicketsTable tickets={tickets} knownProblems={problems} />
          </>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: "default" | "coral" | "green" | "navy" | "amber";
}) {
  const toneClass =
    tone === "coral"
      ? "text-brand-coral"
      : tone === "green"
        ? "text-brand-green"
        : tone === "navy"
          ? "text-brand-navy"
          : tone === "amber"
            ? "text-brand-amber"
            : "text-foreground";

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-3xl font-semibold tracking-tight ${toneClass}`}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

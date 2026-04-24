import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, expectedToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SearchParams = Promise<{ next?: string; error?: string }>;

async function login(formData: FormData) {
  "use server";
  const password = formData.get("password");
  const next = formData.get("next");
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected || typeof password !== "string" || password !== expected) {
    redirect(`/login?error=1${typeof next === "string" ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  const token = await expectedToken(expected);
  const jar = await cookies();
  jar.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect(typeof next === "string" && next.startsWith("/") ? next : "/");
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next, error } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <form
        action={login}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-sm"
      >
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Zoho Desk Dashboard</h1>
          <p className="text-sm text-muted-foreground">Enter the password to continue.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoFocus required />
          <input type="hidden" name="next" value={next ?? "/"} />
        </div>
        {error ? (
          <p className="text-sm text-destructive">Incorrect password.</p>
        ) : null}
        <Button type="submit" className="w-full">
          Sign in
        </Button>
      </form>
    </div>
  );
}

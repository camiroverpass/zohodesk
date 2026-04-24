import "server-only";

export const AUTH_COOKIE = "zohodesk_auth";

export async function expectedToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`zohodesk:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

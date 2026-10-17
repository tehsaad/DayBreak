import { timingSafeEqual } from "node:crypto";
import { cronSecret } from "../env";

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without a configured secret the
 * endpoints refuse to run at all (fail closed).
 */
export function authorizeCron(req: Request): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = cronSecret();
  if (!secret) return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true };
}

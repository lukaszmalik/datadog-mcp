import { z } from "zod";
import { fetchPage, getCurrentUser, parseTime, relMany, scanPages } from "./on-call-common.js";

export const myLatestPageSchema = z.object({
  since: z
    .string()
    .default("now-2d")
    .describe("How far back to look: relative ('now-2d', 'now-1w'), ISO 8601 or epoch seconds"),
  include_timeline: z
    .boolean()
    .default(true)
    .describe("Include the timeline: created, each notification sent, acknowledged, resolved"),
  max_requests: z
    .number()
    .min(1)
    .max(50)
    .default(5)
    .describe("Max list calls; each one reads 100 pages, newest first"),
});

export type MyLatestPageInput = z.infer<typeof myLatestPageSchema>;

export async function myLatestPage(input: MyLatestPageInput): Promise<string> {
  const sinceMs = parseTime(input.since);
  const me = await getCurrentUser();

  const scan = await scanPages({
    sinceMs,
    maxRequests: input.max_requests,
    limit: 1,
    keep: (page) => relMany(page, "responders").some((r) => r.id === me.id),
  });

  const scanned = {
    requests: scan.requests,
    pages_seen: scan.pagesSeen,
    back_to: scan.oldestSeen,
    complete: scan.complete,
  };

  const latest = scan.pages[0];
  if (!latest) {
    return JSON.stringify(
      {
        found: false,
        user: me.name ?? me.id,
        since: new Date(sinceMs).toISOString(),
        scanned,
        note: scan.complete
          ? "No page listed this user as a responder in that window."
          : "Stopped at max_requests before reaching 'since'; raise max_requests or narrow 'since'.",
      },
      null,
      2
    );
  }

  return JSON.stringify(
    { found: true, user: me.name ?? me.id, scanned, page: await fetchPage(latest.id, input.include_timeline) },
    null,
    2
  );
}

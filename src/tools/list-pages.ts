import { z } from "zod";
import { getCurrentUser, parseTime, relMany, relOne, resolveTeam, scanPages, summarizePage } from "./on-call-common.js";

export const listPagesSchema = z.object({
  since: z
    .string()
    .default("now-1d")
    .describe("How far back to look: relative ('now-6h', 'now-2d', 'now-1w'), ISO 8601 or epoch seconds"),
  team: z
    .string()
    .optional()
    .describe("Only pages sent to this team (ID, handle or name)"),
  mine: z
    .boolean()
    .default(false)
    .describe("Only pages where the API key's own user was a responder"),
  status: z
    .enum(["triggered", "acknowledged", "resolved"])
    .optional()
    .describe("Only pages in this status"),
  urgency: z.enum(["low", "high"]).optional().describe("Only pages of this urgency"),
  query: z
    .string()
    .optional()
    .describe("Server-side search over page tags and text (e.g. 'team:web', 'checkout', 'env:prod')"),
  limit: z.number().min(1).max(100).default(20).describe("Max pages to return"),
  max_requests: z
    .number()
    .min(1)
    .max(50)
    .default(10)
    .describe("Max API calls; each one reads 100 pages, newest first"),
  include_description: z
    .boolean()
    .default(false)
    .describe("Include each page's description (first 500 characters)"),
});

export type ListPagesInput = z.infer<typeof listPagesSchema>;

export async function listPages(input: ListPagesInput): Promise<string> {
  const sinceMs = parseTime(input.since);
  const [team, me] = await Promise.all([
    input.team ? resolveTeam(input.team) : Promise.resolve(null),
    input.mine ? getCurrentUser() : Promise.resolve(null),
  ]);

  const scan = await scanPages({
    sinceMs,
    query: input.query,
    maxRequests: input.max_requests,
    limit: input.limit,
    keep: (page) =>
      (!team || relOne(page, "target")?.id === team.id) &&
      (!me || relMany(page, "responders").some((r) => r.id === me.id)) &&
      (!input.status || page.attributes?.status === input.status) &&
      (!input.urgency || page.attributes?.urgency === input.urgency),
  });

  return JSON.stringify(
    {
      since: new Date(sinceMs).toISOString(),
      filters: { team: team?.handle, mine: me ? me.name ?? me.id : undefined, status: input.status, urgency: input.urgency, query: input.query },
      scanned: {
        requests: scan.requests,
        pages_seen: scan.pagesSeen,
        back_to: scan.oldestSeen,
        complete: scan.complete,
        note: scan.complete
          ? undefined
          : `Stopped at max_requests before reaching 'since'; older matches may exist. Raise max_requests.`,
      },
      count: scan.pages.length,
      pages: scan.pages.map((p) =>
        summarizePage(p, scan.included, { descriptionChars: input.include_description ? 500 : 0 })
      ),
    },
    null,
    2
  );
}

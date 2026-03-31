import { z } from "zod";
import { ddGet } from "../config.js";

export const searchEventsSchema = z.object({
  start: z
    .string()
    .describe("Start time as ISO 8601 or epoch seconds"),
  end: z
    .string()
    .default("now")
    .describe("End time as ISO 8601 or epoch seconds (default: now)"),
  priority: z
    .enum(["normal", "low"])
    .optional()
    .describe("Event priority filter"),
  sources: z
    .string()
    .optional()
    .describe("Comma-separated event sources (e.g. 'github,docker,jenkins')"),
  tags: z
    .string()
    .optional()
    .describe("Comma-separated tags to filter (e.g. 'env:prod,service:web')"),
  limit: z
    .number()
    .min(1)
    .max(1000)
    .default(50)
    .describe("Max events to return"),
  unaggregated: z
    .boolean()
    .default(false)
    .describe("Return unaggregated events"),
});

export type SearchEventsInput = z.infer<typeof searchEventsSchema>;

function toEpoch(time: string): string {
  if (/^\d+$/.test(time)) return time;
  if (time === "now") return Math.floor(Date.now() / 1000).toString();

  const match = time.match(/^now-(\d+)([smhd])$/);
  if (match) {
    const [, amount, unit] = match;
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    const seconds = parseInt(amount!) * multipliers[unit!]!;
    return Math.floor((Date.now() - seconds * 1000) / 1000).toString();
  }

  const parsed = Date.parse(time);
  if (isNaN(parsed)) throw new Error(`Cannot parse time: ${time}`);
  return Math.floor(parsed / 1000).toString();
}

interface EventsResponse {
  events: Array<{
    id: number;
    title: string;
    text: string;
    date_happened: number;
    host: string;
    tags: string[];
    source: string;
    priority: string;
    alert_type: string;
  }>;
}

export async function searchEvents(input: SearchEventsInput): Promise<string> {
  const params: Record<string, string> = {
    start: toEpoch(input.start),
    end: toEpoch(input.end),
  };

  if (input.priority) params.priority = input.priority;
  if (input.sources) params.sources = input.sources;
  if (input.tags) params.tags = input.tags;
  if (input.unaggregated) params.unaggregated = "true";

  const response = await ddGet<EventsResponse>("/api/v1/events", params);

  const events = (response.events || []).slice(0, input.limit).map((e) => ({
    id: e.id,
    title: e.title,
    date: new Date(e.date_happened * 1000).toISOString(),
    source: e.source,
    priority: e.priority,
    alert_type: e.alert_type,
    host: e.host,
    tags: e.tags,
    text: e.text?.substring(0, 500),
  }));

  return JSON.stringify(
    {
      count: events.length,
      events,
    },
    null,
    2
  );
}

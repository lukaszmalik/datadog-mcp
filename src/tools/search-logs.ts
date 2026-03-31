import { z } from "zod";
import { ddFetch } from "../config.js";

export const searchLogsSchema = z.object({
  query: z
    .string()
    .default("*")
    .describe("Datadog log query (e.g. 'service:web status:error')"),
  from: z
    .string()
    .default("now-1h")
    .describe("Start time (ISO 8601 or relative like 'now-15m', 'now-1h', 'now-1d')"),
  to: z
    .string()
    .default("now")
    .describe("End time (ISO 8601 or relative)"),
  limit: z
    .number()
    .min(1)
    .max(1000)
    .default(50)
    .describe("Max logs to return (1-1000)"),
  cursor: z
    .string()
    .optional()
    .describe("Pagination cursor from a previous response"),
  sort: z
    .enum(["timestamp_asc", "timestamp_desc"])
    .default("timestamp_desc")
    .describe("Sort order"),
  indexes: z
    .array(z.string())
    .optional()
    .describe("Log indexes to search (omit for all)"),
});

export type SearchLogsInput = z.infer<typeof searchLogsSchema>;

interface LogsSearchResponse {
  data: Array<{
    id: string;
    attributes: {
      timestamp: string;
      status: string;
      service: string;
      message: string;
      host: string;
      tags: string[];
      attributes: Record<string, unknown>;
    };
  }>;
  meta?: {
    page?: { after?: string };
  };
}

export async function searchLogs(input: SearchLogsInput): Promise<string> {
  const body: Record<string, unknown> = {
    filter: {
      query: input.query,
      from: input.from,
      to: input.to,
      ...(input.indexes && { indexes: input.indexes }),
    },
    sort: input.sort === "timestamp_asc" ? "timestamp" : "-timestamp",
    page: {
      limit: input.limit,
      ...(input.cursor && { cursor: input.cursor }),
    },
  };

  const response = await ddFetch<LogsSearchResponse>(
    "/api/v2/logs/events/search",
    body
  );

  const logs = response.data.map((log) => ({
    id: log.id,
    timestamp: log.attributes.timestamp,
    status: log.attributes.status,
    service: log.attributes.service,
    host: log.attributes.host,
    message: log.attributes.message,
    tags: log.attributes.tags,
    attributes: log.attributes.attributes,
  }));

  const result: Record<string, unknown> = {
    count: logs.length,
    logs,
  };

  if (response.meta?.page?.after) {
    result.next_cursor = response.meta.page.after;
    result.has_more = true;
  }

  return JSON.stringify(result, null, 2);
}

import { z } from "zod";
import { ddFetch } from "../config.js";

const computeSchema = z.object({
  aggregation: z
    .enum(["count", "cardinality", "avg", "sum", "min", "max", "pc75", "pc90", "pc95", "pc99"])
    .describe("Aggregation function"),
  metric: z
    .string()
    .optional()
    .describe("Metric field to aggregate (e.g. '@duration'). Not needed for 'count'."),
  type: z
    .enum(["total", "timeseries"])
    .default("total")
    .describe("Whether to return a single value or time-bucketed series"),
  interval: z
    .string()
    .optional()
    .describe("Bucket interval for timeseries (e.g. '5m', '1h')"),
});

const groupBySchema = z.object({
  facet: z
    .string()
    .describe("Facet to group by (e.g. 'service', '@http.status_code', 'host')"),
  limit: z
    .number()
    .default(10)
    .describe("Max groups to return"),
  sort: z
    .object({
      aggregation: z.string().describe("Which compute to sort by"),
      order: z.enum(["asc", "desc"]).default("desc"),
    })
    .optional()
    .describe("Sort order for groups"),
});

export const aggregateLogsSchema = z.object({
  query: z
    .string()
    .default("*")
    .describe("Datadog log query"),
  from: z
    .string()
    .default("now-1h")
    .describe("Start time (ISO 8601 or relative)"),
  to: z
    .string()
    .default("now")
    .describe("End time (ISO 8601 or relative)"),
  compute: z
    .array(computeSchema)
    .min(1)
    .describe("Aggregation computations to perform"),
  group_by: z
    .array(groupBySchema)
    .optional()
    .describe("Facets to group results by"),
  timezone: z
    .string()
    .default("UTC")
    .describe("Timezone for timeseries buckets (e.g. 'Europe/London')"),
});

export type AggregateLogsInput = z.infer<typeof aggregateLogsSchema>;

export async function aggregateLogs(input: AggregateLogsInput): Promise<string> {
  const body: Record<string, unknown> = {
    filter: {
      query: input.query,
      from: input.from,
      to: input.to,
    },
    compute: input.compute.map((c) => ({
      aggregation: c.aggregation,
      ...(c.metric && { metric: c.metric }),
      ...(c.type === "timeseries" && { type: "timeseries" }),
      ...(c.interval && { interval: c.interval }),
    })),
    ...(input.group_by && {
      group_by: input.group_by.map((g) => ({
        facet: g.facet,
        limit: g.limit,
        ...(g.sort && { sort: g.sort }),
      })),
    }),
    options: {
      timezone: input.timezone,
    },
  };

  const response = await ddFetch<Record<string, unknown>>(
    "/api/v2/logs/analytics/aggregate",
    body
  );

  return JSON.stringify(response, null, 2);
}

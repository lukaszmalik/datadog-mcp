import { z } from "zod";
import { ddFetch } from "../config.js";

export const getLogFieldValuesSchema = z.object({
  field: z
    .string()
    .describe(
      "Log field/facet to discover values for (e.g. 'service', 'status', 'host', '@env', '@http.status_code')"
    ),
  query: z
    .string()
    .default("*")
    .describe("Optional query to scope the facet discovery"),
  from: z
    .string()
    .default("now-1h")
    .describe("Start time (ISO 8601 or relative)"),
  to: z
    .string()
    .default("now")
    .describe("End time (ISO 8601 or relative)"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(25)
    .describe("Max values to return"),
});

export type GetLogFieldValuesInput = z.infer<typeof getLogFieldValuesSchema>;

interface AggregateResponse {
  data: {
    buckets: Array<{
      by: Record<string, string>;
      computes: Record<string, number>;
    }>;
  };
}

export async function getLogFieldValues(input: GetLogFieldValuesInput): Promise<string> {
  const body = {
    filter: {
      query: input.query,
      from: input.from,
      to: input.to,
    },
    compute: [
      {
        aggregation: "count",
      },
    ],
    group_by: [
      {
        facet: input.field,
        limit: input.limit,
      },
    ],
  };

  const response = await ddFetch<AggregateResponse>(
    "/api/v2/logs/analytics/aggregate",
    body
  );

  const values = (response.data?.buckets || []).map((bucket) => ({
    value: bucket.by[input.field],
    count: bucket.computes["c0"],
  }));

  return JSON.stringify(
    {
      field: input.field,
      total_values: values.length,
      values,
    },
    null,
    2
  );
}

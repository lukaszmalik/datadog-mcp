#!/usr/bin/env node

import "dotenv/config";
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { searchLogsSchema, searchLogs } from "./tools/search-logs.js";
import { aggregateLogsSchema, aggregateLogs } from "./tools/aggregate-logs.js";
import { getLogFieldValuesSchema, getLogFieldValues } from "./tools/get-log-field-values.js";
import { searchEventsSchema, searchEvents } from "./tools/search-events.js";

const server = new McpServer({
  name: "datadog-mcp",
  version: "1.0.0",
});

server.tool(
  "search_logs",
  "Search Datadog logs with query filters, time range, and pagination. Returns log entries with timestamp, service, status, host, message, and attributes.",
  searchLogsSchema.shape,
  async (params) => ({
    content: [{ type: "text", text: await searchLogs(searchLogsSchema.parse(params)) }],
  })
);

server.tool(
  "aggregate_logs",
  "Run analytics aggregations on Datadog logs — count, avg, sum, percentiles, grouped by facets. Supports timeseries bucketing.",
  aggregateLogsSchema.shape,
  async (params) => ({
    content: [{ type: "text", text: await aggregateLogs(aggregateLogsSchema.parse(params)) }],
  })
);

server.tool(
  "get_log_field_values",
  "Discover possible values for a log field/facet (e.g. service, status, host, env). Returns values sorted by frequency. Useful before searching to know what's available.",
  getLogFieldValuesSchema.shape,
  async (params) => ({
    content: [{ type: "text", text: await getLogFieldValues(getLogFieldValuesSchema.parse(params)) }],
  })
);

server.tool(
  "search_events",
  "Search the Datadog event stream for deploys, alerts, monitor triggers, and other events. Supports filtering by source, tags, and priority.",
  searchEventsSchema.shape,
  async (params) => ({
    content: [{ type: "text", text: await searchEvents(searchEventsSchema.parse(params)) }],
  })
);

async function main() {
  const args = process.argv.slice(2);
  const httpMode = args.includes("--http");
  const port = parseInt(args[args.indexOf("--port") + 1] || "3100", 10);

  if (httpMode) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    await server.connect(transport);

    const httpServer = createServer(async (req, res) => {
      if (req.url === "/mcp") {
        await transport.handleRequest(req, res);
      } else if (req.url === "/health") {
        res.writeHead(200).end("ok");
      } else {
        res.writeHead(404).end("not found");
      }
    });

    httpServer.listen(port, () => {
      console.error(`datadog-mcp listening on http://localhost:${port}/mcp`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

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
import { whoIsOnCallSchema, whoIsOnCall } from "./tools/who-is-on-call.js";
import { listPagesSchema, listPages } from "./tools/list-pages.js";
import { getPageSchema, getPage } from "./tools/get-page.js";
import { myLatestPageSchema, myLatestPage } from "./tools/my-latest-page.js";

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

server.tool(
  "who_is_on_call",
  "Show who is on call right now in Datadog On-Call, with the escalation steps behind them. Give a team ID, handle or name, or omit it to list every team.",
  whoIsOnCallSchema.shape,
  async (params) => ({
    content: [{ type: "text", text: await whoIsOnCall(whoIsOnCallSchema.parse(params)) }],
  })
);

server.tool(
  "my_latest_page",
  "Find the most recent Datadog On-Call page (on-call alert) sent to the user who owns the API key, with who raised it, linked Jira tickets, and its timeline (notifications, acknowledge, resolve). Looks back 2 days by default.",
  myLatestPageSchema.shape,
  async (params) => ({
    content: [{ type: "text", text: await myLatestPage(myLatestPageSchema.parse(params)) }],
  })
);

server.tool(
  "list_pages",
  "List Datadog On-Call pages (on-call alerts), newest first. Filter by time window, team, pages sent to me, status, urgency, or a tag/text query.",
  listPagesSchema.shape,
  async (params) => ({
    content: [{ type: "text", text: await listPages(listPagesSchema.parse(params)) }],
  })
);

server.tool(
  "get_page",
  "Get one Datadog On-Call page by ID: title, status, team, responders, who raised and closed it, linked Jira tickets, description, and its timeline.",
  getPageSchema.shape,
  async (params) => ({
    content: [{ type: "text", text: await getPage(getPageSchema.parse(params)) }],
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

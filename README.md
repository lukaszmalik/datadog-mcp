# datadog-mcp

A read-only [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes Datadog log search, log analytics, event queries and On-Call (who is on call, pages) as MCP tools. Lets LLM-based assistants query your Datadog data without direct API access.

## Tools

| Tool | Description |
|---|---|
| `search_logs` | Search logs with query filters, time range, sort, and pagination |
| `aggregate_logs` | Run analytics on logs — count, avg, sum, percentiles, grouped by facets, with optional timeseries bucketing |
| `get_log_field_values` | Discover possible values for a log field/facet (service, status, host, etc.) sorted by frequency |
| `search_events` | Search the event stream for deploys, alerts, monitor triggers, and other events |
| `who_is_on_call` | Who is on call right now for a team (or every team), with the escalation steps behind them |
| `my_latest_page` | The most recent On-Call page sent to you, with its timeline and linked Jira tickets |
| `list_pages` | On-Call pages, newest first, filtered by time, team, "sent to me", status, urgency or a tag/text query |
| `get_page` | One On-Call page by ID, with description and timeline (notifications, acknowledge, resolve) |

The On-Call tools only send GET requests. The application key's user needs On-Call read access (`on_call_read`) and team read access (`teams_read`).

## Prerequisites

- Node.js 18+
- A Datadog account with an **API key** and **Application key** ([create keys here](https://app.datadoghq.com/organization-settings/api-keys))

## Installation

```bash
git clone https://github.com/lukaszmalik/datadog-mcp.git
cd datadog-mcp
npm install
npm run build
```

## Configuration

Copy the example env file and fill in your keys:

```bash
cp .env.example .env
```

```
DD_API_KEY=your-api-key
DD_APP_KEY=your-app-key
DD_SITE=datadoghq.com
```

`DD_SITE` defaults to `datadoghq.com`. Change it if you use a different Datadog region (e.g. `datadoghq.eu`, `us3.datadoghq.com`, `us5.datadoghq.com`).

## Usage

### Stdio transport (default)

Used by MCP clients that communicate over stdin/stdout (e.g. Claude Code, Claude Desktop):

```bash
npm start
```

### HTTP transport

Starts an HTTP server with a `/mcp` endpoint and a `/health` healthcheck:

```bash
npm start -- --http
npm start -- --http --port 8080  # custom port, default is 3100
```

## MCP client configuration

### Claude Code

Add to your Claude Code MCP settings (`~/.claude/settings.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "datadog": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/datadog-mcp",
      "env": {
        "DD_API_KEY": "your-api-key",
        "DD_APP_KEY": "your-app-key",
        "DD_SITE": "datadoghq.com"
      }
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "datadog": {
      "command": "node",
      "args": ["/absolute/path/to/datadog-mcp/dist/index.js"],
      "env": {
        "DD_API_KEY": "your-api-key",
        "DD_APP_KEY": "your-app-key",
        "DD_SITE": "datadoghq.com"
      }
    }
  }
}
```

### HTTP mode (any MCP client)

Start the server with `--http`, then point your client at:

```
http://localhost:3100/mcp
```

## Tool reference

### search_logs

Search Datadog logs with query filters and pagination.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `query` | string | `*` | Datadog log query (e.g. `service:web status:error`) |
| `from` | string | `now-1h` | Start time — ISO 8601 or relative (`now-15m`, `now-1d`) |
| `to` | string | `now` | End time — ISO 8601 or relative |
| `limit` | number | `50` | Max logs to return (1–1000) |
| `sort` | string | `timestamp_desc` | `timestamp_asc` or `timestamp_desc` |
| `cursor` | string | — | Pagination cursor from a previous response |
| `indexes` | string[] | — | Specific log indexes to search |

### aggregate_logs

Run analytics aggregations on logs.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `query` | string | `*` | Datadog log query |
| `from` | string | `now-1h` | Start time |
| `to` | string | `now` | End time |
| `compute` | object[] | *(required)* | Aggregations to perform (see below) |
| `group_by` | object[] | — | Facets to group results by |
| `timezone` | string | `UTC` | Timezone for timeseries buckets |

**compute** object:

| Field | Type | Description |
|---|---|---|
| `aggregation` | string | `count`, `cardinality`, `avg`, `sum`, `min`, `max`, `pc75`, `pc90`, `pc95`, `pc99` |
| `metric` | string | Field to aggregate (e.g. `@duration`). Not needed for `count`. |
| `type` | string | `total` (single value) or `timeseries` |
| `interval` | string | Bucket interval for timeseries (e.g. `5m`, `1h`) |

**group_by** object:

| Field | Type | Description |
|---|---|---|
| `facet` | string | Facet to group by (e.g. `service`, `@http.status_code`) |
| `limit` | number | Max groups (default 10) |
| `sort` | object | `{ aggregation, order }` for sorting groups |

### get_log_field_values

Discover possible values for a log field, sorted by frequency.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `field` | string | *(required)* | Field/facet to discover (e.g. `service`, `status`, `@env`) |
| `query` | string | `*` | Query to scope the discovery |
| `from` | string | `now-1h` | Start time |
| `to` | string | `now` | End time |
| `limit` | number | `25` | Max values to return (1–100) |

### search_events

Search the Datadog event stream.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `start` | string | *(required)* | Start time — ISO 8601 or epoch seconds |
| `end` | string | `now` | End time |
| `priority` | string | — | `normal` or `low` |
| `sources` | string | — | Comma-separated sources (e.g. `github,docker`) |
| `tags` | string | — | Comma-separated tags (e.g. `env:prod,service:web`) |
| `limit` | number | `50` | Max events (1–1000) |
| `unaggregated` | boolean | `false` | Return unaggregated events |

### who_is_on_call

Who is on call right now in Datadog On-Call.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `team` | string | — | Team ID, handle or name; a unique partial match works (`payments`). Omit it to list every team, which makes one request per team. |

### my_latest_page

The most recent On-Call page that lists the application key's own user as a responder, with its full details and timeline. It reads pages newest first, 100 per request, and stops at the first match. One request usually covers about three days.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `since` | string | `now-2d` | How far back to look: relative (`now-6h`, `now-1w`), ISO 8601 or epoch seconds |
| `include_timeline` | boolean | `true` | Include the timeline |
| `max_requests` | number | `5` | Max list requests (1–50) |

### list_pages

On-Call pages, newest first. Team, "mine", status and urgency are filtered on the client, so a narrow filter over a long window can take many requests. When the scan stops at `max_requests` before reaching `since`, the response says so.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `since` | string | `now-1d` | How far back to look |
| `team` | string | — | Only pages sent to this team (ID, handle or name) |
| `mine` | boolean | `false` | Only pages where you were a responder |
| `status` | string | — | `triggered`, `acknowledged` or `resolved` |
| `urgency` | string | — | `low` or `high` |
| `query` | string | — | Server-side search over page tags and text (`team:web`, `checkout`) |
| `limit` | number | `20` | Max pages to return (1–100) |
| `max_requests` | number | `10` | Max list requests, 100 pages each (1–50) |
| `include_description` | boolean | `false` | Include the first 500 characters of each description |

### get_page

One On-Call page by ID.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `id` | string | *(required)* | Page ID (UUID) from `list_pages` or `my_latest_page` |
| `include_timeline` | boolean | `true` | Include the timeline: created, each notification with its channel (push, SMS, voice) and delivery time, acknowledged, resolved |

Page responses include the team, responders, who raised the page (a user or a monitor), who closed it, minutes to acknowledge and close, and any Jira keys found in `atlassian.net/browse/` links.

**Note:** the page endpoints (`/api/v2/on-call/pages`, `/pages/{id}`, `/pages/{id}/timeline`) are not in Datadog's published API reference, which only lists the POST calls for creating, acknowledging and resolving pages. They are the endpoints the Datadog web app reads from, and Datadog can change them without notice.

## License

MIT

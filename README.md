# datadog-mcp

A read-only [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes Datadog log search, log analytics, and event queries as MCP tools. Lets LLM-based assistants query your Datadog data without direct API access.

## Tools

| Tool | Description |
|---|---|
| `search_logs` | Search logs with query filters, time range, sort, and pagination |
| `aggregate_logs` | Run analytics on logs — count, avg, sum, percentiles, grouped by facets, with optional timeseries bucketing |
| `get_log_field_values` | Discover possible values for a log field/facet (service, status, host, etc.) sorted by frequency |
| `search_events` | Search the event stream for deploys, alerts, monitor triggers, and other events |

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

## License

MIT

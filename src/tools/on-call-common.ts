// Shared helpers for the On-Call tools. Every request here is a GET.
//
// The page endpoints (/api/v2/on-call/pages, /pages/{id}, /pages/{id}/timeline) are not in
// Datadog's published API docs, which only list the POST calls (create, acknowledge, escalate,
// resolve). They are what the Datadog UI uses and may change without notice.

import { ddGet } from "../config.js";

export interface Ref {
  id: string;
  type: string;
}

interface RelData {
  data?: Ref | Ref[] | null;
}

export interface Resource {
  id: string;
  type: string;
  attributes?: Record<string, any> | null;
  relationships?: Record<string, RelData> | null;
}

export interface JsonApiList {
  data: Resource[] | null;
  included?: Resource[];
  meta?: { page?: { total?: number; next_number?: number | null } };
}

export interface JsonApiOne {
  data: Resource | null;
  included?: Resource[];
}

/** Index of `included` resources, keyed by "type/id". */
export class Included {
  private map = new Map<string, Resource>();

  add(resources: Resource[] | undefined): this {
    for (const r of resources ?? []) this.map.set(`${r.type}/${r.id}`, r);
    return this;
  }

  get(ref: Ref | null | undefined): Resource | undefined {
    return ref ? this.map.get(`${ref.type}/${ref.id}`) : undefined;
  }
}

export function relOne(r: Resource, name: string): Ref | null {
  const d = r.relationships?.[name]?.data;
  return d && !Array.isArray(d) ? d : null;
}

export function relMany(r: Resource, name: string): Ref[] {
  const d = r.relationships?.[name]?.data;
  return Array.isArray(d) ? d : d ? [d] : [];
}

export interface Person {
  id: string;
  name?: string;
  email?: string;
}

export function person(ref: Ref | null, inc: Included): Person | null {
  if (!ref) return null;
  const a = inc.get(ref)?.attributes;
  return { id: ref.id, name: a?.name, email: a?.email };
}

/** Parse "now", "now-15m" (s/m/h/d/w), epoch seconds, or ISO 8601 into epoch milliseconds. */
export function parseTime(time: string): number {
  const t = time.trim();
  if (t === "now") return Date.now();
  const rel = t.match(/^now-(\d+)([smhdw])$/);
  if (rel) {
    const unit = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[rel[2] as "s" | "m" | "h" | "d" | "w"];
    return Date.now() - parseInt(rel[1]!, 10) * unit * 1000;
  }
  if (/^\d{9,11}$/.test(t)) return parseInt(t, 10) * 1000;
  const parsed = Date.parse(t);
  if (isNaN(parsed)) throw new Error(`Cannot parse time: ${time}`);
  return parsed;
}

// ---- current user and teams (cached for the life of the process) ----

const TEAM_CACHE_MS = 60 * 60 * 1000;
let teamCache: { at: number; teams: Resource[] } | null = null;
let currentUser: Person | null = null;

export async function getCurrentUser(): Promise<Person> {
  if (!currentUser) {
    const res = await ddGet<JsonApiOne>("/api/v2/current_user");
    if (!res.data) throw new Error("Datadog returned no current user for this application key");
    currentUser = { id: res.data.id, name: res.data.attributes?.name, email: res.data.attributes?.email };
  }
  return currentUser;
}

export async function listTeams(): Promise<Resource[]> {
  if (teamCache && Date.now() - teamCache.at < TEAM_CACHE_MS) return teamCache.teams;
  const teams: Resource[] = [];
  for (let n = 0; n < 50; n++) {
    const res = await ddGet<JsonApiList>("/api/v2/team", {
      "page[size]": "100",
      "page[number]": String(n),
    });
    const batch = res.data ?? [];
    teams.push(...batch);
    if (batch.length < 100) break;
  }
  teamCache = { at: Date.now(), teams };
  return teams;
}

export interface TeamInfo {
  id: string;
  handle?: string;
  name?: string;
}

export function teamInfo(t: Resource): TeamInfo {
  return { id: t.id, handle: t.attributes?.handle, name: t.attributes?.name };
}

/** Find a team by ID, handle or name (case-insensitive; a unique partial match also works). */
export async function resolveTeam(input: string): Promise<TeamInfo> {
  const q = input.trim().toLowerCase();
  const teams = await listTeams();
  const exact = teams.find(
    (t) =>
      t.id.toLowerCase() === q ||
      String(t.attributes?.handle ?? "").toLowerCase() === q ||
      String(t.attributes?.name ?? "").trim().toLowerCase() === q
  );
  if (exact) return teamInfo(exact);

  const partial = teams.filter(
    (t) =>
      String(t.attributes?.handle ?? "").toLowerCase().includes(q) ||
      String(t.attributes?.name ?? "").toLowerCase().includes(q)
  );
  if (partial.length === 1) return teamInfo(partial[0]!);
  if (partial.length === 0) throw new Error(`No Datadog team matches "${input}"`);
  const names = partial.map((t) => `${t.attributes?.name} (${t.attributes?.handle})`).join(", ");
  throw new Error(`"${input}" matches several teams: ${names}. Use the handle.`);
}

// ---- pages ----

const PAGE_BATCH = 100; // the API caps page[size] at 100

export interface ScanOptions {
  sinceMs: number;
  query?: string;
  maxRequests: number;
  limit: number;
  keep: (page: Resource) => boolean;
}

export interface ScanResult {
  pages: Resource[];
  included: Included;
  requests: number;
  pagesSeen: number;
  oldestSeen?: string;
  /** True when the scan went back as far as `since` (or ran out of pages). */
  complete: boolean;
}

/** Walk pages newest first, keeping matches, until `since`, `limit` or `maxRequests` is reached. */
export async function scanPages(opts: ScanOptions): Promise<ScanResult> {
  const included = new Included();
  const pages: Resource[] = [];
  let requests = 0;
  let pagesSeen = 0;
  let oldestSeen: string | undefined;

  for (let n = 0; n < opts.maxRequests; n++) {
    const params: Record<string, string> = {
      "page[size]": String(PAGE_BATCH),
      "page[number]": String(n),
      sort: "-created_at",
    };
    if (opts.query) params["filter[query]"] = opts.query;

    const res = await ddGet<JsonApiList>("/api/v2/on-call/pages", params);
    requests++;
    included.add(res.included);
    const batch = res.data ?? [];

    for (const page of batch) {
      pagesSeen++;
      const created = String(page.attributes?.created_at ?? "");
      oldestSeen = created;
      if (Date.parse(created) < opts.sinceMs) {
        return { pages, included, requests, pagesSeen, oldestSeen, complete: true };
      }
      if (opts.keep(page)) {
        pages.push(page);
        if (pages.length >= opts.limit) {
          return { pages, included, requests, pagesSeen, oldestSeen, complete: true };
        }
      }
    }

    if (batch.length < PAGE_BATCH || res.meta?.page?.next_number == null) {
      return { pages, included, requests, pagesSeen, oldestSeen, complete: true };
    }
  }

  return { pages, included, requests, pagesSeen, oldestSeen, complete: false };
}

const JIRA_URL = /atlassian\.net\/browse\/([A-Z][A-Z0-9_]*-\d+)/g;

function jiraKeys(...texts: Array<string | undefined>): string[] {
  const keys = new Set<string>();
  for (const text of texts) for (const m of (text ?? "").matchAll(JIRA_URL)) keys.add(m[1]!);
  return [...keys];
}

function cleanDescription(text: string | undefined, maxChars: number): string | undefined {
  if (!text) return undefined;
  const cleaned = text.replace(/%%%/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars)}…` : cleaned;
}

function minutesBetween(from: string | undefined, to: string | undefined): number | undefined {
  if (!from || !to) return undefined;
  const ms = Date.parse(to) - Date.parse(from);
  return isNaN(ms) ? undefined : Math.round(ms / 6000) / 10;
}

function raisedBy(page: Resource, inc: Included): Record<string, unknown> | null {
  const ref = relOne(page, "author");
  if (!ref) return null;
  const a = inc.get(ref)?.attributes ?? {};
  switch (ref.type) {
    case "users":
      return { type: "user", id: ref.id, name: a.name, email: a.email };
    case "monitors":
      return { type: "monitor", monitor_id: a.monitor_id, alert_url: a.alert_url, event_id: a.event_id };
    default:
      return { type: ref.type, id: ref.id, ...a };
  }
}

export interface PageSummaryOptions {
  descriptionChars?: number; // 0 leaves the description out
}

export function summarizePage(page: Resource, inc: Included, opts: PageSummaryOptions = {}) {
  const a = page.attributes ?? {};
  const teamRef = relOne(page, "target");
  const team = teamRef ? inc.get(teamRef) : undefined;
  const descriptionChars = opts.descriptionChars ?? 0;

  return {
    id: page.id,
    key: a.key,
    title: a.title,
    status: a.status,
    urgency: a.urgency,
    created_at: a.created_at,
    acknowledged_at: a.acknowledged_at ?? undefined,
    closed_at: a.closed_at ?? undefined,
    minutes_to_acknowledge: minutesBetween(a.created_at, a.acknowledged_at),
    minutes_to_close: minutesBetween(a.created_at, a.closed_at),
    team: team ? teamInfo(team) : teamRef ? { id: teamRef.id } : null,
    responders: relMany(page, "responders").map((r) => person(r, inc)),
    raised_by: raisedBy(page, inc),
    closed_by: person(relOne(page, "closed_by"), inc),
    jira: jiraKeys(a.title, a.description),
    tags: a.tags ?? [],
    description: descriptionChars > 0 ? cleanDescription(a.description, descriptionChars) : undefined,
  };
}

interface TimelineEntry {
  at: string;
  event: string;
  by?: string;
  title?: string;
  to?: string;
  channel?: string;
  status?: string;
  delivered_at?: string;
  details?: unknown;
  notificationId?: string;
}

export function summarizeTimeline(res: JsonApiList) {
  const inc = new Included().add(res.included);
  const entries: TimelineEntry[] = (res.data ?? [])
    .map((cell): TimelineEntry => {
      const author = relOne(cell, "author");
      const content = inc.get(relOne(cell, "content"));
      const at = cell.attributes?.created_at as string;
      const by = author?.type === "users" ? person(author, inc)?.name ?? author.id : author?.type;

      if (content?.type === "timeline_lifecycle_cell_content") {
        return { at, event: content.attributes?.lifecycle, by, title: content.attributes?.title };
      }
      if (content?.type === "timeline_notification_cell_content") {
        const to = person(relOne(content, "user"), inc);
        return {
          at,
          event: "notification",
          to: to?.name ?? to?.id,
          channel: content.attributes?.notification_type,
          status: content.attributes?.status,
          notificationId: content.attributes?.notification_id,
        };
      }
      return { at, event: content?.type ?? cell.type, by, details: content?.attributes ?? undefined };
    })
    .sort((x, y) => Date.parse(x.at) - Date.parse(y.at));

  // Each notification appears as "sent" (with its channel) and later "success" (delivered),
  // under the same notification_id. Fold them into one entry.
  const byNotification = new Map<string, TimelineEntry>();
  const merged: TimelineEntry[] = [];
  for (const e of entries) {
    const first = e.notificationId ? byNotification.get(e.notificationId) : undefined;
    if (first) {
      first.channel ??= e.channel;
      if (e.status === "success") first.delivered_at = e.at;
      first.status = e.status ?? first.status;
      continue;
    }
    if (e.notificationId) byNotification.set(e.notificationId, e);
    merged.push(e);
  }
  return merged.map(({ notificationId, ...rest }) => rest);
}

/** One page with its timeline (two GETs, in parallel). */
export async function fetchPage(id: string, withTimeline: boolean) {
  const path = `/api/v2/on-call/pages/${encodeURIComponent(id)}`;
  const [one, timeline] = await Promise.all([
    ddGet<JsonApiOne>(path),
    withTimeline ? ddGet<JsonApiList>(`${path}/timeline`) : Promise.resolve(null),
  ]);
  if (!one.data) throw new Error(`On-Call page ${id} not found`);
  const inc = new Included().add(one.included);
  return {
    ...summarizePage(one.data, inc, { descriptionChars: 3000 }),
    timeline: timeline ? summarizeTimeline(timeline) : undefined,
  };
}

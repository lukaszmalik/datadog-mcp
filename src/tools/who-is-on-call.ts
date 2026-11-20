import { z } from "zod";
import { ddGet } from "../config.js";
import { Included, JsonApiOne, listTeams, person, relMany, resolveTeam, teamInfo, TeamInfo } from "./on-call-common.js";

export const whoIsOnCallSchema = z.object({
  team: z
    .string()
    .optional()
    .describe(
      "Team ID, handle or name (e.g. 'payments-team' or 'Payments'). Omit to list every team."
    ),
});

export type WhoIsOnCallInput = z.infer<typeof whoIsOnCallSchema>;

async function teamOnCall(team: TeamInfo) {
  const res = await ddGet<JsonApiOne>(`/api/v2/on-call/teams/${encodeURIComponent(team.id)}/on-call`, {
    include: "responders,escalations.responders",
  });
  const inc = new Included().add(res.included);
  const data = res.data;
  return {
    team,
    on_call_now: data ? relMany(data, "responders").map((r) => person(r, inc)) : [],
    escalation_steps: data
      ? relMany(data, "escalations").map((ref, i) => {
          const step = inc.get(ref);
          return { step: i + 1, responders: step ? relMany(step, "responders").map((r) => person(r, inc)) : [] };
        })
      : [],
  };
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function whoIsOnCall(input: WhoIsOnCallInput): Promise<string> {
  if (input.team) {
    return JSON.stringify(await teamOnCall(await resolveTeam(input.team)), null, 2);
  }

  const teams = (await listTeams()).map(teamInfo);
  const results = await mapLimited(teams, 6, teamOnCall);
  const staffed = results
    .filter((r) => r.on_call_now.length > 0)
    .map((r) => ({
      team: r.team.name,
      handle: r.team.handle,
      on_call_now: r.on_call_now.map((p) => p?.name ?? p?.id),
      escalation_steps: r.escalation_steps.length,
    }))
    .sort((x, y) => String(x.team).localeCompare(String(y.team)));
  const nobody = results
    .filter((r) => r.on_call_now.length === 0)
    .map((r) => r.team.name)
    .sort();

  return JSON.stringify({ teams: results.length, on_call: staffed, nobody_on_call: nobody }, null, 2);
}

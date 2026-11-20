import { z } from "zod";
import { fetchPage } from "./on-call-common.js";

export const getPageSchema = z.object({
  id: z.string().uuid().describe("Page ID (UUID), as returned by list_pages or my_latest_page"),
  include_timeline: z
    .boolean()
    .default(true)
    .describe("Include the timeline: created, each notification sent, acknowledged, resolved"),
});

export type GetPageInput = z.infer<typeof getPageSchema>;

export async function getPage(input: GetPageInput): Promise<string> {
  return JSON.stringify(await fetchPage(input.id, input.include_timeline), null, 2);
}

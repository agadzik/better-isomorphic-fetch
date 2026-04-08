import { vercelFetch } from "./fetcher";

export interface Team {
  id: string;
  slug: string;
  name: string;
  avatar?: string;
  createdAt: number;
}

export function teamKey(teamSlug: string) {
  return `/v2/teams/${teamSlug}`;
}

export async function getTeam(teamSlug: string): Promise<Team> {
  return vercelFetch<Team>(teamKey(teamSlug));
}

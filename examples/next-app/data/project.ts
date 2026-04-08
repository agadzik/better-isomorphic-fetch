import { vercelFetch } from "./fetcher";
import type { Project } from "./projects";

export function projectKey(teamSlug: string, projectId: string) {
  return `/v9/projects/${projectId}?teamId=${teamSlug}`;
}

export async function getProject(
  teamSlug: string,
  projectId: string
): Promise<Project> {
  return vercelFetch<Project>(projectKey(teamSlug, projectId));
}

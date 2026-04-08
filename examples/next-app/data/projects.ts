import { vercelFetch } from "./fetcher";

export interface Project {
  id: string;
  name: string;
  framework: string | null;
  latestDeployments?: Array<{
    id: string;
    url: string;
    state: string;
    createdAt: number;
    readyAt?: number;
    target: string | null;
    meta?: {
      githubCommitMessage?: string;
      githubCommitRef?: string;
    };
  }>;
  link?: {
    type: string;
    repo: string;
    org: string;
  };
  targets?: Record<
    string,
    {
      alias?: string[];
      url?: string;
    }
  >;
}

interface ProjectsResponse {
  projects: Project[];
}

export function projectsKey(teamSlug: string) {
  return `/v9/projects?teamId=${teamSlug}`;
}

export async function getProjects(teamSlug: string): Promise<Project[]> {
  const res = await vercelFetch<ProjectsResponse>(projectsKey(teamSlug));
  return res.projects;
}

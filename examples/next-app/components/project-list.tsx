"use client";

import useSWR from "swr";
import { swrFetcher } from "../data/fetcher";
import { projectsKey, type Project } from "../data/projects";
import Link from "next/link";

function DeploymentStatus({ state }: { state: string }) {
  const colors: Record<string, string> = {
    READY: "bg-emerald-500",
    ERROR: "bg-red-500",
    BUILDING: "bg-amber-500",
    QUEUED: "bg-neutral-400",
    CANCELED: "bg-neutral-400",
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${colors[state] ?? "bg-neutral-400"}`}
    />
  );
}

export function ProjectList({ teamSlug }: { teamSlug: string }) {
  const { data: projects } = useSWR<Project[]>(
    projectsKey(teamSlug),
    async (key: string) => {
      const res = await swrFetcher<{ projects: Project[] }>(key);
      return res.projects;
    }
  );

  if (!projects) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => {
        const deployment = project.latestDeployments?.[0];
        const prodUrl =
          project.targets?.production?.alias?.[0] ??
          project.targets?.production?.url;

        return (
          <Link
            key={project.id}
            href={`/${teamSlug}/${project.name}`}
            className="rounded-lg border border-neutral-200 p-4 transition-colors hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
          >
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{project.name}</h3>
              {project.framework && (
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                  {project.framework}
                </span>
              )}
            </div>
            {prodUrl && (
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {prodUrl}
              </p>
            )}
            {deployment && (
              <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <DeploymentStatus state={deployment.state} />
                <span>{deployment.state}</span>
                <span>&middot;</span>
                <span>
                  {new Date(deployment.createdAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

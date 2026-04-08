"use client";

import useSWR from "swr";
import { swrFetcher } from "../data/fetcher";
import { projectKey } from "../data/project";
import type { Project } from "../data/projects";

function StatusBadge({ state }: { state: string }) {
  const styles: Record<string, string> = {
    READY: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    ERROR: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    BUILDING: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    QUEUED: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
    CANCELED: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[state] ?? styles.QUEUED}`}
    >
      {state}
    </span>
  );
}

export function ProjectDetail({
  teamSlug,
  projectId,
}: {
  teamSlug: string;
  projectId: string;
}) {
  const { data: project } = useSWR<Project>(
    projectKey(teamSlug, projectId),
    swrFetcher
  );

  if (!project) return null;

  const deployment = project.latestDeployments?.find(
    (d) => d.target === "production"
  );
  const prodUrl =
    project.targets?.production?.alias?.[0] ??
    project.targets?.production?.url;
  const repo = project.link
    ? `${project.link.org}/${project.link.repo}`
    : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{project.name}</h1>
          {project.framework && (
            <span className="rounded bg-neutral-100 px-2 py-0.5 text-sm text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
              {project.framework}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-neutral-500 dark:text-neutral-400">
          {prodUrl && <span>{prodUrl}</span>}
          {repo && <span>{repo}</span>}
        </div>
      </div>

      {deployment && (
        <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Production Deployment
          </h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <StatusBadge state={deployment.state} />
              {deployment.url && (
                <a
                  href={`https://${deployment.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                >
                  {deployment.url}
                </a>
              )}
            </div>
            {deployment.meta?.githubCommitMessage && (
              <p className="text-sm">{deployment.meta.githubCommitMessage}</p>
            )}
            <div className="flex flex-wrap gap-4 text-xs text-neutral-500 dark:text-neutral-400">
              {deployment.meta?.githubCommitRef && (
                <span>{deployment.meta.githubCommitRef}</span>
              )}
              <span>
                Created {new Date(deployment.createdAt).toLocaleString()}
              </span>
              {deployment.readyAt && (
                <span>
                  Built in{" "}
                  {Math.round(
                    (deployment.readyAt - deployment.createdAt) / 1000
                  )}
                  s
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

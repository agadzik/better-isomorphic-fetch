import { SWRConfig } from "swr";
import { getProject, projectKey } from "../../../data/project";
import { getTeam, teamKey } from "../../../data/team";
import { getUser, USER_KEY } from "../../../data/user";
import { Header } from "../../../components/header";
import { ProjectDetail } from "../../../components/project-detail";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ teamSlug: string; project: string }>;
}) {
  const { teamSlug, project: projectId } = await params;

  const [projectData, team, user] = await Promise.all([
    getProject(teamSlug, projectId),
    getTeam(teamSlug),
    getUser(),
  ]);

  return (
    <SWRConfig
      value={{
        fallback: {
          [projectKey(teamSlug, projectId)]: projectData,
          [teamKey(teamSlug)]: team,
          [USER_KEY]: user,
        },
      }}
    >
      <Header teamSlug={teamSlug} />
      <main className="mx-auto w-full max-w-6xl flex-1 p-6">
        <ProjectDetail teamSlug={teamSlug} projectId={projectId} />
      </main>
    </SWRConfig>
  );
}

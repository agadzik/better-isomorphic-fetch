import { SWRConfig } from "swr";
import { getProjects, projectsKey } from "../../data/projects";
import { getTeam, teamKey } from "../../data/team";
import { getUser, USER_KEY } from "../../data/user";
import { Header } from "../../components/header";
import { ProjectList } from "../../components/project-list";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ teamSlug: string }>;
}) {
  const { teamSlug } = await params;

  const [projects, team, user] = await Promise.all([
    getProjects(teamSlug),
    getTeam(teamSlug),
    getUser(),
  ]);

  return (
    <SWRConfig
      value={{
        fallback: {
          [projectsKey(teamSlug)]: projects,
          [teamKey(teamSlug)]: team,
          [USER_KEY]: user,
        },
      }}
    >
      <Header teamSlug={teamSlug} />
      <main className="mx-auto w-full max-w-6xl flex-1 p-6">
        <h1 className="mb-6 text-2xl font-bold">Projects</h1>
        <ProjectList teamSlug={teamSlug} />
      </main>
    </SWRConfig>
  );
}

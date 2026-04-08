"use client";

import useSWR from "swr";
import { swrFetcher } from "../data/fetcher";
import { teamKey, type Team } from "../data/team";
import { USER_KEY, type User } from "../data/user";
import Link from "next/link";

export function Header({ teamSlug }: { teamSlug: string }) {
  const { data: team } = useSWR<Team>(teamKey(teamSlug), swrFetcher);
  const { data: user } = useSWR<User>(USER_KEY, async () => {
    const res = await swrFetcher<{ user: User }>(USER_KEY);
    return res.user;
  });

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
      <div className="flex items-center gap-3">
        {team?.avatar ? (
          <img
            src={team.avatar}
            alt={team.name}
            className="h-8 w-8 rounded-full"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-neutral-200 dark:bg-neutral-700" />
        )}
        <Link
          href={`/${teamSlug}`}
          className="text-sm font-semibold hover:underline"
        >
          {team?.name ?? teamSlug}
        </Link>
      </div>
      <div className="flex items-center gap-2">
        {user && (
          <>
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              {user.username}
            </span>
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.username}
                className="h-8 w-8 rounded-full"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-neutral-300 dark:bg-neutral-600" />
            )}
          </>
        )}
      </div>
    </header>
  );
}

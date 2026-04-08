import { vercelFetch } from "./fetcher";

export interface User {
  id: string;
  email: string;
  name: string;
  username: string;
  avatar?: string;
}

interface UserResponse {
  user: User;
}

export const USER_KEY = "/v2/user";

export async function getUser(): Promise<User> {
  const res = await vercelFetch<UserResponse>(USER_KEY);
  return res.user;
}

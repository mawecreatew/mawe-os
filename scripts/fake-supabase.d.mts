import type { Server } from 'node:http';

export const FAKE_ANON_KEY: string;
export const FAKE_USERS: Record<string, { id: string; password: string; member: { app_user_id: string; name: string; role: string } | null }>;
export function startFakeSupabase(port: number): Promise<{
  server: Server;
  workspace: { id: string; data: unknown; version: number };
  users: typeof FAKE_USERS;
}>;

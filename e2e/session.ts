import fs from "node:fs";
import path from "node:path";

export const AUTH_DIR = path.join(__dirname, ".auth");
export const SESSION_FILE = path.join(AUTH_DIR, "session.json");
export const STATE_FILE = path.join(AUTH_DIR, "state.json");

export type Session = {
  token: string;
  refreshToken?: string;
  user: { id: number; name: string; email: string; role: string };
};

export function readSession(): Session {
  if (!fs.existsSync(SESSION_FILE)) {
    throw new Error(`No session at ${SESSION_FILE} — the "setup" project must run first.`);
  }
  return JSON.parse(fs.readFileSync(SESSION_FILE, "utf8")) as Session;
}

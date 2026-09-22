import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

let database: DatabaseSync | undefined;
export function db() {
  if (database) return database;
  const path = resolve(process.env.DATABASE_PATH || "data/newsfeed.sqlite");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  database = new DatabaseSync(path);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS feeds (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('rss', 'bluesky')), value TEXT NOT NULL,
      PRIMARY KEY(user_id, kind, value)
    );
    CREATE TABLE IF NOT EXISTS viewed_articles (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      article_id TEXT NOT NULL, viewed_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, article_id)
    );
    CREATE TABLE IF NOT EXISTS login_attempts (
      email TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL
    );
  `);
  return database;
}

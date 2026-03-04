import Database from '@tauri-apps/plugin-sql';
import { getDbPath } from './constants';

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!db) {
    const path = await getDbPath();
    db = await Database.load(path);
  }

  return db;
}

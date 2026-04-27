import { rmSync } from "node:fs";

// Reset the test database before the suite runs so every CI run starts clean.
export default async function globalSetup() {
  const dbPath = "./knowledge.test.db";
  for (const path of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`, `${dbPath}-journal`]) {
    try {
      rmSync(path);
    } catch {
      // file did not exist — fine
    }
  }
}

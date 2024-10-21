import fs from "fs/promises";
import path from "path";

import { type Json, type MaybePromise } from "~/util";

export type StorageAdapter = {
  get(table: string, key: string): MaybePromise<Json | null>;
  getAll(table: string): MaybePromise<Map<string, Json>>;
  set(table: string, key: string, value: Json): MaybePromise<void>;
  delete(table: string, key: string): MaybePromise<void>;
  clear(table: string): MaybePromise<void>;
};

export class FileStorageAdapater implements StorageAdapter {
  constructor(public dir: string) {}

  async get(table: string, key: string) {
    const filePath = path.join(this.dir, table, `${key}.json`);
    try {
      await fs.stat(filePath);
    } catch {
      return null;
    }
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data) as Json;
  }

  async getAll(table: string) {
    const dir = path.join(this.dir, table);
    try {
      await fs.stat(dir);
    } catch {
      return new Map();
    }
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const result = new Map<string, Json>();
    for (const entry of entries) {
      if (entry.isFile()) {
        const key = entry.name.slice(0, -5);
        const filePath = path.join(dir, entry.name);
        const value = await fs.readFile(filePath, "utf-8");
        result.set(key, JSON.parse(value) as Json);
      }
    }
    return result;
  }

  async set(table: string, key: string, value: Json) {
    const dir = path.join(this.dir, table);
    const filePath = path.join(dir, `${key}.json`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(value));
  }

  async delete(table: string, key: string) {
    const filePath = path.join(this.dir, table, `${key}.json`);
    await fs.unlink(filePath);
  }

  async clear(table: string) {
    const dir = path.join(this.dir, table);
    await fs.rm(dir, { recursive: true, force: true });
  }
}

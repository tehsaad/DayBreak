import { dataDir, storageMode } from "../env";
import { FileStore } from "./file-store";
import { createServiceStore } from "./supabase-store";
import type { Store } from "./types";

let fileStore: FileStore | null = null;

/** Demo-mode store (file-backed), shared per process. */
export function getFileStore(): FileStore {
  fileStore ??= FileStore.inDir(dataDir());
  return fileStore;
}

/**
 * Store with server credentials, for ingestion and cron. In Supabase mode this uses the
 * service-role key and must never be handed to request code acting for a reader.
 */
export function getServiceStore(): Store {
  if (storageMode() === "supabase") return createServiceStore();
  return getFileStore();
}

export type { Store } from "./types";

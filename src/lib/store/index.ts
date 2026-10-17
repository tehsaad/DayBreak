import { dataDir, sharedNewsStorage } from "../env";
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
 * Store with server credentials, for ingestion and cron. With a Supabase service-role key this is
 * Postgres and must never be handed to request code acting for a reader; otherwise it is the
 * per-instance file store (shared news only — reader data then lives in Supabase per session).
 */
export function getServiceStore(): Store {
  if (sharedNewsStorage() === "supabase") return createServiceStore(getFileStore());
  return getFileStore();
}

export type { Store } from "./types";

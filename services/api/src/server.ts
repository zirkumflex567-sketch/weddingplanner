import { fileURLToPath } from "node:url";
import { buildApp } from "./app";
import { FileConsultantSessionStore } from "./consultant-session-store";
import { FilePrototypeWorkspaceStore } from "./prototype-store";
import { FileVendorRefreshStore } from "./vendor-refresh-store";

async function start() {
  const runtimeDataUrl = new URL("../../../data/runtime/", import.meta.url);
  const workspaceStore = new FilePrototypeWorkspaceStore(
    fileURLToPath(new URL("workspaces.json", runtimeDataUrl))
  );
  const vendorRefreshStore = new FileVendorRefreshStore(
    fileURLToPath(new URL("vendor-refresh-jobs.json", runtimeDataUrl))
  );
  const consultantSessionStore = new FileConsultantSessionStore(
    fileURLToPath(new URL("consultant-sessions.json", runtimeDataUrl))
  );
  const app = buildApp({
    workspaceStore,
    vendorRefreshStore,
    consultantSessionStore
  });
  const port = Number(process.env.PORT ?? "3001");
  const host = process.env.HOST ?? "127.0.0.1";

  try {
    const address = await app.listen({ port, host });
    console.log(`Wedding API listening on ${address}`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

void start();

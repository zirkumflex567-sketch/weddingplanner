import { fileURLToPath } from "node:url";
import { buildApp } from "./app";
import { FilePrototypeWorkspaceStore } from "./prototype-store";

async function start() {
  const workspaceStore = new FilePrototypeWorkspaceStore(
    fileURLToPath(new URL("../../../data/runtime/workspaces.json", import.meta.url))
  );
  const app = buildApp({ workspaceStore });
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

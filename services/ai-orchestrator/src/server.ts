import { buildAiOrchestratorApp } from "./index";

async function start() {
  const app = buildAiOrchestratorApp();
  const port = Number(process.env.PORT ?? "3010");
  const host = process.env.HOST ?? "127.0.0.1";

  try {
    const address = await app.listen({ port, host });
    console.log(`AI orchestrator listening on ${address}`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

void start();

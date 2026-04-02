import cors from "@fastify/cors";
import Fastify from "fastify";
import {
  createBootstrapPlan,
  isWeddingBootstrapInput
} from "@wedding/shared";
import {
  InMemoryPrototypeWorkspaceStore,
  isCreateExpenseInput,
  isCreateGuestInput,
  isSetTaskCompletionInput,
  isUpdateGuestInput,
  isUpdateVendorInput,
  type PrototypeWorkspaceStore
} from "./prototype-store";

interface BuildAppOptions {
  workspaceStore?: PrototypeWorkspaceStore;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: false });
  const workspaceStore =
    options.workspaceStore ?? new InMemoryPrototypeWorkspaceStore();

  app.register(cors, {
    origin: true
  });

  app.get("/health", async () => ({
    status: "ok"
  }));

  app.post("/planning/bootstrap", async (request, reply) => {
    if (!isWeddingBootstrapInput(request.body)) {
      return reply.code(400).send({
        error: "Invalid onboarding payload"
      });
    }

    return {
      plan: createBootstrapPlan(request.body)
    };
  });

  app.post("/prototype/workspaces", async (request, reply) => {
    if (!isWeddingBootstrapInput(request.body)) {
      return reply.code(400).send({
        error: "Invalid onboarding payload"
      });
    }

    const workspace = await workspaceStore.createWorkspace(request.body);

    return reply.code(201).send({ workspace });
  });

  app.get("/prototype/workspaces", async () => {
    const profiles = await workspaceStore.listWorkspaces();

    return { profiles };
  });

  app.get("/prototype/workspaces/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const workspace = await workspaceStore.getWorkspace(params.id);

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace not found" });
    }

    return { workspace };
  });

  app.delete("/prototype/workspaces/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const deleted = await workspaceStore.deleteWorkspace(params.id);

    if (!deleted) {
      return reply.code(404).send({ error: "Workspace not found" });
    }

    return reply.code(204).send();
  });

  app.patch("/prototype/workspaces/:id/onboarding", async (request, reply) => {
    const params = request.params as { id: string };

    if (!isWeddingBootstrapInput(request.body)) {
      return reply.code(400).send({
        error: "Invalid onboarding payload"
      });
    }

    const workspace = await workspaceStore.updateWorkspace(params.id, request.body);

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace not found" });
    }

    return { workspace };
  });

  app.post("/prototype/workspaces/:id/guests", async (request, reply) => {
    const params = request.params as { id: string };

    if (!isCreateGuestInput(request.body)) {
      return reply.code(400).send({ error: "Invalid guest payload" });
    }

    const workspace = await workspaceStore.addGuest(params.id, request.body);

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace not found" });
    }

    return reply.code(201).send({ workspace });
  });

  app.patch("/prototype/workspaces/:id/guests/:guestId", async (request, reply) => {
    const params = request.params as { id: string; guestId: string };

    if (!isUpdateGuestInput(request.body)) {
      return reply.code(400).send({ error: "Invalid guest update payload" });
    }

    const workspace = await workspaceStore.updateGuest(
      params.id,
      params.guestId,
      request.body
    );

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace or guest not found" });
    }

    return { workspace };
  });

  app.get("/public/rsvp/:token", async (request, reply) => {
    const params = request.params as { token: string };
    const session = await workspaceStore.getPublicRsvpSession(params.token);

    if (!session) {
      return reply.code(404).send({ error: "Guest invitation not found" });
    }

    return session;
  });

  app.patch("/public/rsvp/:token", async (request, reply) => {
    const params = request.params as { token: string };

    if (!isUpdateGuestInput(request.body)) {
      return reply.code(400).send({ error: "Invalid public rsvp payload" });
    }

    const session = await workspaceStore.updatePublicRsvp(params.token, request.body);

    if (!session) {
      return reply.code(404).send({ error: "Guest invitation not found" });
    }

    return session;
  });

  app.post("/prototype/workspaces/:id/expenses", async (request, reply) => {
    const params = request.params as { id: string };

    if (!isCreateExpenseInput(request.body)) {
      return reply.code(400).send({ error: "Invalid expense payload" });
    }

    const workspace = await workspaceStore.addExpense(params.id, request.body);

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace not found" });
    }

    return reply.code(201).send({ workspace });
  });

  app.patch("/prototype/workspaces/:id/vendors/:vendorId", async (request, reply) => {
    const params = request.params as { id: string; vendorId: string };

    if (!isUpdateVendorInput(request.body)) {
      return reply.code(400).send({ error: "Invalid vendor payload" });
    }

    const workspace = await workspaceStore.updateVendor(
      params.id,
      params.vendorId,
      request.body
    );

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace or vendor not found" });
    }

    return { workspace };
  });

  app.patch("/prototype/workspaces/:id/tasks/:taskId", async (request, reply) => {
    const params = request.params as { id: string; taskId: string };

    if (!isSetTaskCompletionInput(request.body)) {
      return reply.code(400).send({ error: "Invalid task payload" });
    }

    const workspace = await workspaceStore.setTaskCompletion(
      params.id,
      params.taskId,
      request.body.completed
    );

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace or task not found" });
    }

    return { workspace };
  });

  return app;
}

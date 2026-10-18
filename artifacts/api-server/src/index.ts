import app from "./app";
import { logger } from "./lib/logger";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

let pythonBackend: ChildProcess | undefined;

async function findAvailableLoopbackPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("Could not select a local Python backend port"));
        return;
      }
      probe.close((err) => {
        if (err) reject(err);
        else resolvePort(address.port);
      });
    });
  });
}

async function waitForPythonBackend(
  pythonPort: number,
  backend: ChildProcess,
): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (backend.exitCode !== null) {
      throw new Error("Python HR backend exited before becoming ready");
    }
    try {
      const response = await fetch(`http://127.0.0.1:${pythonPort}/healthz`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return;
    } catch {
      // Retry while Uvicorn starts.
    }
    await sleep(250);
  }
  throw new Error("Python HR backend did not become ready within 15 seconds");
}

async function start(): Promise<void> {
  const pythonPort = await findAvailableLoopbackPort();
  process.env.HR_PYTHON_PORT = String(pythonPort);
  const backend = spawn(
    process.env.PYTHON_EXECUTABLE ?? "python3",
    [resolve(process.cwd(), "python", "main.py")],
    {
      env: {
        ...process.env,
        HR_PYTHON_PORT: String(pythonPort),
        PYTHONUNBUFFERED: "1",
      },
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  pythonBackend = backend;

  backend.on("error", (err) => {
    logger.error({ err }, "Unable to start Python HR backend");
  });

  backend.on("exit", (code, signal) => {
    if (code !== 0) {
      logger.error({ code, signal }, "Python HR backend exited unexpectedly");
    }
  });

  await waitForPythonBackend(pythonPort, backend);
  const server = app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port, pythonPort }, "API gateway and Python backend are listening");
  });

  const shutdown = (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Shutting down API services");
    server.close(() => {
      backend.kill("SIGTERM");
      process.exit(0);
    });
    setTimeout(() => {
      backend.kill("SIGKILL");
      process.exit(1);
    }, 10_000).unref();
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

start().catch((err: unknown) => {
  logger.error({ err }, "Failed to start API services");
  pythonBackend?.kill("SIGTERM");
  process.exit(1);
});

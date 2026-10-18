import { Router, type IRouter } from "express";
import { clerkClient, getAuth } from "@clerk/express";

const router: IRouter = Router();

router.use("/hr", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to access HR services." });
    return;
  }

  const rawPort = process.env.HR_PYTHON_PORT;
  if (!rawPort) {
    req.log.error("Python backend port is not configured");
    res.status(503).json({ error: "HR services are temporarily unavailable." });
    return;
  }

  let email: string | null = null;
  try {
    const user = await clerkClient.users.getUser(userId);
    email =
      user.emailAddresses.find(
        (address) => address.id === user.primaryEmailAddressId,
      )?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null;
  } catch (err) {
    req.log.warn({ err }, "Could not resolve signed-in employee email");
  }

  try {
    const pathAndQuery = req.originalUrl.replace(/^\/api/, "");
    const upstream = await fetch(
      `http://127.0.0.1:${rawPort}${pathAndQuery}`,
      {
        method: req.method,
        headers: {
          "content-type": "application/json",
          "x-hr-employee-id": userId,
          ...(email ? { "x-hr-employee-email": email } : {}),
        },
        ...(req.method === "GET" || req.method === "HEAD"
          ? {}
          : { body: JSON.stringify(req.body ?? {}) }),
        signal: AbortSignal.timeout(60_000),
      },
    );

    if (upstream.status === 204) {
      res.sendStatus(204);
      return;
    }

    const payload = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status);
    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("content-type", contentType);
    res.send(payload);
  } catch (err) {
    req.log.error({ err }, "Python HR backend request failed");
    res.status(502).json({ error: "HR services are temporarily unavailable." });
  }
});

router.use("/hr", (_req, res) => {
  res.status(404).json({ error: "HR service endpoint not found." });
});

export default router;

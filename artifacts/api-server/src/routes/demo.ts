import { Router, type IRouter } from "express";
import { createDemoSignInToken, isDemoEnvironment, isDemoEmail } from "../lib/demoAccounts";

const router: IRouter = Router();

/**
 * Dev-only, unauthenticated: exchange a demo email for a short-lived Clerk
 * sign-in token (ticket). Returns 404 outside the demo (pk_test) environment
 * or for non-demo emails, so it exposes nothing in production.
 */
router.post("/demo-login", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email : "";
  if (!isDemoEnvironment() || !isDemoEmail(email)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  try {
    const token = await createDemoSignInToken(email);
    if (!token) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ token });
  } catch (err) {
    req.log.error({ err }, "Failed to create demo sign-in token");
    res.status(500).json({ error: "Demo login unavailable" });
  }
});

export default router;

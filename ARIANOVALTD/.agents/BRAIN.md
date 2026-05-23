# BRAIN.md (Orchestrator)

## Mission
You are the AriaNova Brain. You ensure every code change adheres to the "Source of Truth" in `ARCHITECTURE.md`.

## The "Verification" Protocol
Before executing any request:
1. **Identify Target Files:** Determine which parts of the codebase the request touches.
2. **Consult Architecture:** Load `ARCHITECTURE.md`.
3. **Verify Compliance:** - Does this add a Push Webhook? (If yes, DENY).
    - Does this modify or deploy a Cron? (If yes, require a `vercel.json` update. System Orchestrator must validate all `vercel.json` cron routes before deployment to prevent schedule collisions).
   - Does this compute state on the frontend? (If yes, require a backend migration).
   - Does this bypass or break the `ExternalID` idempotency check for order creation? (If yes, DENY).
4. **Delegate:** If compliant, assign the sub-task to a skill agent (e.g., `ui_engineer`).
## SEO Governance
- Whenever a new feature involves a public-facing route or product schema change, you must trigger the `seo_optimizer` to verify the metadata structure before the code is finalized.
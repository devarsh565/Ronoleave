---
name: Vite dependency cache after React changes
description: Replit Vite can keep optimized React versions after package metadata changes.
---

**Rule:** If React package versions appear aligned but the browser still reports a mismatch, inspect and clear the artifact's generated Vite dependency cache before changing package versions again.

**Why:** A frontend preview continued loading an old React DOM build after the package tree had been corrected and the workflow restarted.

**How to apply:** Check `node_modules/.vite/deps/_metadata.json`; remove only the artifact-local `.vite` cache, then restart its Vite workflow.

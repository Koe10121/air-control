---
name: prd-to-issues
description: Break a PRD into small, independently grabbable issues using vertical slices (tracer bullets). Writes markdown files to issues/.
---

1. Read the PRD in `issues/`. Explore the codebase if this is a fresh session.
2. Draft issues as **vertical slices**: each one cuts through every layer it needs (data, logic,
   UI) and ends with something visible I can try. Never make an issue that is only one layer
   (e.g. "build the service" with no UI). The first slice should be the thinnest possible
   end-to-end path.
3. Each issue must be small enough to finish in one fresh session (well under ~100k tokens).
4. For each issue give: title, what to build, acceptance criteria, `blocked_by` (other issue
   numbers or none), and `type: AFK` (an agent can do it alone) or `type: HITL` (needs me).
5. Show me the list and the blocking graph before writing anything. Push back on yourself:
   if a slice looks horizontal, split it differently.
6. When I approve, write `issues/NNN-<slug>.md` files (001, 002, ...).

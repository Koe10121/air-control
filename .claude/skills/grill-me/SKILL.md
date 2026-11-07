---
name: grill-me
description: Interview the user about a plan or idea until we share the same understanding. Use before writing any PRD or code.
---

Your job is to reach a shared understanding with me, not to produce a plan.

1. Read the brief or idea I give you. Explore the codebase if one exists (use a subagent so the
   exploration doesn't fill this context).
2. Ask me **one question at a time**. Work through the design tree branch by branch, settling
   decisions that others depend on first.
3. For every question, give **your recommended answer and why**, so I can just say "yes".
4. Ask about things I probably haven't thought of: edge cases, failure modes, data, testing,
   what's out of scope.
5. Don't write a plan or code. Keep going until I say we're done, or until there are no open
   branches left. Then give a short list of the decisions we made.

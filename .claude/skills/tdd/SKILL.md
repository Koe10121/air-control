---
name: tdd
description: Implement using test-driven development (red, green, refactor). Use for any logic module.
---

For each behaviour:

1. **Red**: write ONE failing test for the next small behaviour. Run it and confirm it fails for
   the right reason.
2. **Green**: write the simplest code that makes it pass. Run the tests.
3. **Refactor**: clean up while the tests stay green.

Rules:
- Test through the module's public interface, not its internals. Prefer one test boundary
  around a deep module over many tests on tiny helpers.
- For vision code, use recorded landmark fixtures (JSON) instead of a live camera.
- Never edit a test just to make it pass unless the test itself was wrong; say so if it was.
- Finish by running the full feedback loop: `npm test` and `npm run typecheck`.

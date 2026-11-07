---
name: write-prd
description: Turn the current conversation (usually after /grill-me) into a PRD saved in issues/. The PRD is the destination document.
---

Write a PRD from the decisions in this conversation. Don't invent new requirements; ask if
something important is missing.

Save it as `issues/000-prd-<short-name>.md` with these sections:

1. **Problem**: what the user faces and why it matters.
2. **Solution**: the shape of the fix in a few sentences.
3. **User stories**: numbered, "As a ___, I want ___ so that ___".
4. **Modules**: before writing, propose which modules will be created or changed, each with its
   interface (what goes in, what comes out). Prefer deep modules: small interface, lots of logic
   inside, easy to test as a unit. Confirm the module list with me.
5. **Implementation decisions**: the choices we made and why.
6. **Testing decisions**: what is tested, at which module boundary, with what fixtures.
7. **Out of scope**: what we decided NOT to do (this is the definition of done).

---
name: token-efficient-work
description: Reduce token use and iteration waste during coding tasks. Use when the user asks to work efficiently, minimize context or tool calls, or when a task risks broad exploration and repeated verification.
---

# Token-Efficient Work

Deliver the requested result with the smallest reliable amount of reasoning, context, and tool activity. Do not trade correctness for brevity: inspect the relevant source, make a bounded change, and verify the acceptance criteria once.

## Operating protocol

1. **Classify the request.** Identify the requested outcome, files likely involved, and what counts as done. Ask one concise question only if a missing choice blocks safe implementation; otherwise infer from project context.
2. **Use existing context first.** Do not reread files, repeat searches, reload skills, or rerun checks whose result is still valid. Read the narrowest relevant window. Search broadly only when the target is genuinely unknown.
3. **Choose the smallest adequate workflow.**
   - Tiny, localized change: edit directly; no delegation or plan ceremony.
   - Multi-file, clearly specified implementation: delegate once if the work is independent; provide paths, constraints, and exact acceptance tests.
   - Unclear or high-risk change: inspect first, then state a short plan before editing.
4. **Keep tool calls purposeful.** Before each batch, state the next action in one short sentence. Combine independent reads/checks in a batch where supported. Do not run speculative diagnostics or duplicate inspections.
5. **Edit atomically.** Prefer one focused edit per file. Use current file anchors and verify the resulting structure. Do not make repeated line-number guesses; reread after a stale or ambiguous edit response. Avoid formatting unrelated code.
6. **Use skills selectively.** Load only the skill that materially informs this task. Do not load multiple overlapping design or motion skills by default.
7. **Verify by risk, not habit.** Run the narrowest check that covers the change (for example syntax check for JS, one focused test, or one browser interaction). A browser visual task gets one preview, then only targeted checks. Do not rerun a passing check without a new code change or a specific reason.
8. **Stop when acceptance criteria pass.** Do not keep polishing, testing adjacent features, or adding fixes unrelated to the request. Report any unverified item plainly instead of expanding the task to chase it.

## Delegation

Delegate only work that is truly separable, multi-file, or unusually broad. Never delegate a task that is quicker to finish directly. Give the delegate a complete brief and a finite report format. While it runs, pursue an independent task; do not wait idly. Do not ask multiple agents to inspect the same change.

## Failure and recovery

- On a tool failure, classify it once: stale anchor, syntax/payload error, unsupported capability, or transient service issue.
- Make one evidence-based recovery attempt. If the capability remains unavailable, switch to an equivalent local check or state the limitation.
- Never repeat the same failed call unchanged, guess at unseen file structure, or claim a verification that did not happen.
- For edits, reread current content after a stale/ambiguous result; after two unsuccessful attempts on the same change, stop and report the blocker rather than looping.

## Response budget

- User-facing progress updates: one sentence per meaningful tool batch.
- Final response: outcome, files or behavior changed, and only material remaining limitations. Prefer a few bullets; do not narrate internal tool history or token accounting unless asked.

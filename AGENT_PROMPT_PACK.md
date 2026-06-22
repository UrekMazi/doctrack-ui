# DocTrack Agent Prompt Pack

Use these prompts in Cursor or Antigravity when working in this repo.

## Mode Picker
- Implement/Fix: make a targeted code change with minimal scope.
- Review: inspect for bugs, regressions, and missing tests; do not rewrite.
- Challenge: pressure-test an idea, expose weak logic, and ask for specifics.

Pick one mode first, then fill in the skeleton below.

## Next Action Rules
- If the prompt is about scan/OCR/register/routing/delegation/finalization, open the matching workflow map first.
- If the prompt asks for an update or fix, start from the nearest concrete anchor and make the smallest safe slice.
- If the prompt asks for review, return findings only, ordered by severity, with file references and line numbers.
- If the prompt asks for challenge mode, challenge weak logic, ask 3 follow-up questions, and play devil’s advocate.
- If the prompt is vague, stop and ask for specifics before changing code.
- After the first substantive edit, run the cheapest focused validation for the touched slice.

## General Prompt Skeleton
```text
Task: <what you want changed>
Mode: <implement/fix | review | challenge>
Scope: <feature/workflow>
Anchor: <file, symbol, or workflow map>
Constraints: <what must stay the same>
Validation: <test, run, or spot-check>
```

## Copy-Paste Launch Prompts

### Implement/Fix
```text
Implement this in the smallest safe slice.
Start from the nearest concrete anchor and use the workflow map first if this touches scan/OCR/register/routing/delegation/finalization.
Preserve existing behavior unless I explicitly ask for a workflow change.
Make the smallest edit that tests the hypothesis.
After the first substantive edit, run the cheapest focused validation.
```

### Review
```text
Review this as a senior code reviewer.
Focus on bugs, regressions, edge cases, state mutations, unnecessary re-renders, and missing tests.
Report only concrete findings with file references and line numbers.
Prioritize severity.
Do not write new code unless I ask.
```

### Challenge
```text
Challenge my thinking.
Do not validate my idea by default.
Point out weak logic, lazy assumptions, or vague reasoning.
Ask 3 deeper follow-up questions.
Play devil’s advocate and tell me what a skeptic would argue.
If I’m vague, stop and ask for specifics.
Seek truth over comfort.
```

## 1) Implement/Fix Mode
Use this when you want the agent to make the change.

```text
Implement this in the smallest safe slice.
Start from the nearest concrete anchor and use the workflow map first if this touches scan/OCR/register/routing/delegation.
Preserve existing behavior unless I explicitly ask for a workflow change.
Make the smallest edit that tests the hypothesis.
After the first substantive edit, run the cheapest focused validation.
```

Best add-ons:
- “Keep API contracts backward compatible.”
- “Preserve validation, role checks, and persistence paths.”
- “Do not widen scope unless the anchor contract is broken.”

## 2) Review Mode
Use this when you want a code review, not a rewrite.

```text
Review this as a senior code reviewer.
Focus on bugs, regressions, edge cases, state mutations, unnecessary re-renders, and missing tests.
Report only concrete findings with file references and line numbers.
Prioritize severity.
Do not write new code unless I ask.
```

Best add-ons:
- “If there are no findings, say that explicitly.”
- “Call out behavioral regressions first.”
- “Keep the response findings-first, not a summary.”

## 3) Challenge Mode
Use this when you want the agent to challenge your thinking instead of validating it.

```text
Challenge my thinking.
Do not validate my idea by default.
Point out weak logic, lazy assumptions, or vague reasoning.
Ask 3 deeper follow-up questions.
Play devil’s advocate and tell me what a skeptic would argue.
If I’m vague, stop and ask for specifics.
Seek truth over comfort.
```

Best add-ons:
- “If I’m wrong, say so clearly and explain why.”
- “Push me to define terms concretely.”
- “Force me to defend the position.”

## Repo Rules To Include When Relevant
- Use the matching workflow map first for document workflows.
- Keep edits minimal and local.
- Validate the touched slice immediately after the first substantive edit.
- Prefer existing patterns in the repo.
- Preserve backward compatibility unless migration is requested.

## Current Work Context
- Source of truth for recent updates: `.docs/HANDOFF.md`
- Latest completed batch: Control/Tracking -> Control/Reference wording, `PPA|` -> `PPA-PMO-NOB|` QR prefix, and the matching Scan/Register, transmittal, and report label cleanup
- Active notification work: reminder sound selection lives in `src/components/TopNav.jsx`; OPM assistant/secretary/PM should use `opm_pm_notif.wav`, reminder timing target is 3 minutes, and notifications should remain limited to newly routed documents needing action
- Current state: changes are still uncommitted, so start from the nearest anchor and validate the touched slice first

## Versioned Update Archive
- Read latest first, then step backward only if the request depends on older workflow behavior.
- v5: OPM Assistant can edit pending finalization before division release.
- v4: `Pending OPM Finalization` added; divisions stay locked until release.
- v3: reroute corrections for routed or acknowledged documents.
- v2: OneDrive-primary with Seagate D fallback.
- v1: core intake -> OCR -> register -> route -> delegate flow.

## What The Agent Should Do Next
1. Read the mode and choose one behavior: implement/fix, review, or challenge.
2. Read the anchor or workflow map first.
3. Apply the smallest correct action for that mode.
4. Validate only the touched slice.
5. Expand scope only if the anchor contract is broken.

## Quick Shortcuts
- Scan/OCR/register/routing/delegation -> open the matching workflow map first.
- Review -> findings only, with file references and line numbers.
- Challenge -> 3 follow-up questions + devil’s advocate + specificity checks.

# DocTrack Agent Playbook

Use this repo in local-first, map-first mode. Prefer small, targeted edits over broad scans.

## Default operating rules
- Start from the nearest concrete anchor: failing file, user-referenced file, or workflow map.
- For document workflows, always open the matching workflow map first.
- Read only the declared anchors and contracts before searching wider.
- Preserve existing behavior unless the user explicitly requests a workflow change.
- Make the smallest edit that tests the current hypothesis.
- After the first substantive edit, run the cheapest focused validation immediately.

## Required retrieval order
1. Classify the request by workflow keywords.
2. Open the matching map or handoff note first.
3. Read only the listed anchors and schema/contracts.
4. Edit the minimal scope files only.
5. Expand search only if the anchor contract is broken or the file moved.
6. Update the workflow map/version if the contract changes.

## Active DocTrack workflow maps
If a local map file exists, open it first. If not, use these embedded summaries and the listed anchors.

### Scan/register OCR flow
- Goal: avoid broad rescans for scan/OCR/register issues.
- Primary anchors: `src/pages/ScanRegister.jsx`, `src/utils/ocrEngine.js`, `server/routes/ocr.py`, `server/routes/documents.py`, `server/models.py`, `src/context/DocumentContext.jsx`
- Call chain: upload to EDMS -> OCR extract -> operator verify/edit -> register -> save attachments -> add document.
- Guardrails: keep OCR field names stable, preserve attachment naming, preserve 409 uniqueness handling, keep `addDocument` response shape.

### Intake to delegation flow
- Goal: cover scan PDF intake -> OCR -> operator verify/edit -> register -> OPM -> PM -> OPM finalization -> division routing -> delegation -> reroute corrections.
- Primary anchors: `src/pages/ScanRegister.jsx`, `src/pages/DocumentDetail.jsx`, `src/pages/OPMEndorsed.jsx`, `src/pages/DivisionDocuments.jsx`, `src/utils/workflowLabels.js`, `server/routes/documents.py`, `server/models.py`, `src/context/DocumentContext.jsx`
- Guardrails: preserve `Pending OPM Finalization`, keep division access locked until finalization, preserve routing history append-only, keep backend `extra_data` compatibility.

### Index/protocol reference
- Retrieval protocol: classify by workflow keywords, open the matching map or summary first, read only anchors/contracts, edit minimal scope, expand only on contract mismatch, update the map/version if the contract changes.
- Versioning: keep immutable versions; prefer latest unless the user asks for historical behavior.

## Prompting pattern for agents
- State the exact outcome you want.
- Name the workflow or feature area.
- Point to the anchor file if known.
- Say whether you want implementation, debugging, or review.
- Ask for minimal changes and explicit validation.

## Challenge mode
Use this when you want the agent to challenge ideas instead of validating them by default.
- Challenge weak logic, lazy assumptions, and echo-chamber thinking.
- Ask 3 follow-up questions that go deeper than surface-level.
- Play devil’s advocate and state what a smart skeptic would argue.
- Pause on vague, generic, or abstract claims and ask for specifics.
- Seek truth over comfort; say clearly when the idea is weak or wrong.

## Update prompt checklist
- Say exactly what should change.
- Say exactly what must stay the same.
- Include the anchor file or workflow map when known.
- Include the success check, test, or spot-check.
- Mention whether the task is a fix, update, refactor, or review.
- Ask the agent to avoid broad searches unless the anchor fails.

## Prompt template
```text
Task: <what to change>
Scope: <feature/workflow>
Anchor: <file or workflow map>
Constraints: <behavior to preserve>
Validation: <test, run, or spot-check>
```

```text
Challenge my thinking.
Do not validate my idea by default.
Point out weak logic, lazy assumptions, or vague reasoning.
Ask 3 deeper follow-up questions.
Play devil’s advocate and tell me what a skeptic would argue.
If I’m vague, stop and ask for specifics.
```

## Example update prompts
```text
Update the scan/register flow in src/pages/ScanRegister.jsx.
Keep the current OCR field names and attachment naming stable.
Validate with the cheapest focused scan/register check.
```

```text
Update the notification timer logic.
Keep the existing routing rules intact.
Start from the file that actually owns the timer and validate only that slice.
```

```text
Review the current implementation for regressions.
Report only concrete issues with file references and line numbers.
```

## Practical guardrails
- Do not widen scope until the local hypothesis is checked.
- Keep API contracts backward compatible unless a migration is requested.
- Preserve role checks, validation, and persistence paths.
- Prefer existing patterns in the repo over introducing new abstractions.
- For UI work, keep styling consistent with the existing codebase.

## Useful repo references
- Session handoff: `.docs/HANDOFF.md`
- Frontend style guide: `.docs/rules/code-style.md`
- Review role notes: `.docs/agents/reviewer.md`

## Current Work Context
- Source of truth for in-flight updates: `.docs/HANDOFF.md`
- Latest completed batch: Control/Tracking -> Control/Reference wording, `PPA|` -> `PPA-PMO-NOB|` QR prefix, and the related Scan/Register and report wording cleanup
- Active notification work: `src/components/TopNav.jsx` owns reminder sound selection, OPM assistant/secretary/PM should use `opm_pm_notif.wav`, reminder timing target is 3 minutes, and notifications should stay limited to newly routed documents needing action
- Resume state: changes are still uncommitted, so keep future edits local and validate the touched slice first

## Versioned Update Archive
- Read latest first, then walk backward only if the prompt touches older workflow behavior.
- v5: `Pending OPM Finalization` became editable by OPM Assistant before final release to divisions.
- v4: `Pending OPM Finalization` added; division access stayed locked until OPM finalized routing.
- v3: OPM reroute correction added for documents already routed or acknowledged.
- v2: OneDrive-primary with Seagate D fallback became the active storage policy.
- v1: Base intake -> OCR -> register -> OPM -> PM -> division delegation map.

## When to search
- Search only after the map/anchor read if the contract is unclear.
- If the request mentions scan, OCR, register, routing, delegation, or finalization, use the intake map first.
- If the request mentions notification sounds or timers, locate the controlling file first, then edit only that slice.

## External-agent note
- For Cursor/Antigravity, keep this file at repo root so the agent can load it automatically.
- Reusable prompt pack: `AGENT_PROMPT_PACK.md`.
- If you mirror these rules into a vendor-specific rules file later, keep the same ordering: anchor first, minimal search, minimal edit, immediate validation.

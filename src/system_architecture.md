# Records Section Process Automation and Tracking System

As-Built Architecture Blueprint
Last updated: March 30, 2026

This document reflects the exact implementation currently running in the codebase after Phase 2 completion (Stages IV, V, and VI).

## 1. Complete End-to-End Workflow (Stages I through VI)

### Stage I - Intake (Scan, OCR, Control Number, Registration)

Primary implementation:

- src/pages/ScanRegister.jsx
- src/context/DocumentContext.jsx

Actual flow:

1. Operator uploads one or more files (PDF/image) in Scan & Register.
2. System captures receive timestamp immediately (`receivedDate`, `receivedTime`).
3. OCR pipeline runs and extracts metadata (subject, sender, sender address, dates, action hints, routing hints).
4. Operator assigns a generated Control/Reference Number (`generateTrackingNumber`).
5. Operator reviews/edits extracted metadata. Register action is blocked until required metadata and routing target are valid.
6. System generates attachment artifacts (original PDF, stamped PNG, stamped PDF), saves files externally (folder picker or backend file endpoint), and persists lightweight attachment metadata in the document record.
7. Document is saved via `addDocument(...)` with status set to `Registered`.
8. Initial `routingHistory` audit entries are written:
   - `Received & Timestamped`
   - `Scanned, PDF/OCR Processed, Control/Reference # Assigned`
   - `Transmittal Slip & Sticker Printed`

Fields persisted at this stage include:

- `trackingNumber`, sender/subject/date metadata, `targetDivision`/`targetDivisions`
- `status: Registered`
- `currentLocation: Records Section`
- timing metrics (`controlAssignedAt`, `registeredAt`, duration fields)
- generated attachment metadata

### Stage II - OPM Endorsement (Digital Handoff)

Primary implementation:

- src/pages/DocumentDetail.jsx
- src/pages/OPMEndorsed.jsx

Actual flow:

1. Operator opens `DocumentDetail` for an incoming document in `Registered` status.
2. Operator uses `Endorse to OPM` modal.
3. On submit, system updates the document to:
   - `status: For OPM Assistant Review`
   - `currentLocation: OPM Assistant Desk`
   - `targetDivision: OPM Assistant Desk`
4. Optional operator remarks are appended to `instructionComments` as Records comments.
5. `routingHistory` appends handoff entry: submitted for assistant completeness check.
6. OPM Assistant reviews in queue (`OPMEndorsed` when role is OPM Assistant).
7. Assistant approval transitions document to:
   - `status: Endorsed to OPM`
   - `currentLocation: Office of the Port Manager (OPM)`
   - `targetDivision: Office of the Port Manager (OPM)`
8. `routingHistory` appends: verified by OPM Assistant and forwarded to OPM.

### Stage III - PM Routing (Main Division, Supporting Divisions, Action, Instructions)

Primary implementation:

- src/pages/DocumentDetail.jsx (PM route modal)
- src/pages/OPMEndorsed.jsx (PM queue route panel)

Actual flow:

1. PM opens routing UI for an OPM-endorsed document.
2. PM selects exactly one Main Division.
3. PM optionally selects Supporting Division(s); main division is excluded from supporting selection.
4. PM chooses transmittal action and enters PM instructions/comments.
5. PM chooses dispatch mode:
   - Physical + Digital
   - Physical handover
   - Digital assignment
6. System updates document with:
   - `status: Routed to Division`
   - `targetDivision` (main), `mainDivision`, `oprDivision`
   - `targetDivisions` (main + supporting)
   - `supportingDivisions`
   - `action`, `pmTransmittalInstructions`
   - `currentLocation` (single main division or `Multiple Divisions`)
7. `routingHistory` appends PM route event including method, OPR/Main, action, and instructions.

Division receipt checkpoint after routing:

- Division users acknowledge routed documents through QR receive in `DocumentDetail`.
- `divisionReceipts` is updated per division.
- Status remains `Routed to Division` until all routed divisions acknowledge.
- Status becomes `Received & Acknowledged` when all routed divisions have receipts.

### Stage IV - DM Delegation (Division Manager Assigns Personnel)

Primary implementation:

- src/pages/DocumentDetail.jsx

Modal behavior (`Delegate Task / Assign Personnel`):

1. Division user opens document in routed state.
2. Visibility of `Delegate Task` button is gated by all of the following:
   - `currentUser.systemRole === 'Division'`
   - document status is `Routed to Division` or `Received & Acknowledged`
   - user is in main division or supporting division (or routed by code mapping)
3. User selects personnel from division-specific mock options (`DIVISION_PERSONNEL`) and enters localized instructions/remarks.
4. Submit is blocked until both personnel and instructions are provided.
5. On submit, system persists:
   - `assignedTo`
   - `assignedBy`
   - `assignedDivision`
   - `assignedAt`
6. Localized instructions are appended to `instructionComments` with required assignee prefix format:
   - `[Assigned to: <personnel>] <localized instructions>`
7. `routingHistory` appends delegation event with timestamp and acting division user.

How delegation comments appear on the transmittal slip:

- Delegation comment is stored as a non-PM instruction comment.
- Non-PM instruction comments are rendered in the slip `COMMENTS / REMARKS` section.
- This makes assignee name + localized instruction visible in both preview and print outputs.

### Stages V and VI - Completion and Closure (`Completed`)

Primary implementation:

- src/pages/DocumentDetail.jsx

Modal behavior (`Complete Task & Close Document`):

1. User opens completion modal from `Document Information` card.
2. Visibility of `Complete Task` button is gated by:
   - status is `Routed to Division` or `Received & Acknowledged`
   - user belongs to the Main Division (`isUserMainDivision`)
3. Modal requires `Action/s Taken` text.
4. Modal accepts optional proof file upload.
5. On submit, system updates:
   - `status: Completed`
   - `actionTaken` (required narrative)
   - `completionAttachment` (optional filename only)
   - `completedBy`
   - `completedAt`
6. `routingHistory` appends closure event:
   - `Task completed. Action taken: ...; Proof: ...` (proof fragment appears only if file provided)
7. Status badge and queues reflect terminal closure state `Completed`.

Important as-built behavior note:

- The uploaded proof file is currently captured as filename metadata in document state; binary file persistence for this proof field is not implemented in this modal yet.
- Completion visibility is main-division based; there is currently no additional check that the current user matches `assignedTo`.

## 2. Shared Components and UI Patterns

### 2.1 Centralized Incoming Transmittal Slip (Single Source of Truth)

Primary implementation:

- src/components/IncomingTransmittalSlip.jsx

Pattern:

- A single reusable component (`IncomingTransmittalSlip`) is used by:
  - src/pages/ScanRegister.jsx
  - src/pages/DocumentDetail.jsx
- Both pages build `transmittalSlipProps` and render the same component for on-screen preview.
- Both pages also use the same component for print by rendering static markup from this component.

Outcome:

- Preview and print are synchronized by design, reducing layout drift.

### 2.2 Centralized Print Pipeline

Primary implementation:

- src/utils/incomingTransmittalPrint.js

Pattern:

1. Page creates static slip markup with `renderToStaticMarkup(<IncomingTransmittalSlip ... isPrint />)`.
2. Shared utility `openIncomingTransmittalPrintWindow(...)` opens a print preview window.
3. Utility injects consistent print HTML/CSS, including print-specific sizing variables for `.incoming-transmittal-slip`.
4. Utility handles recoverable failures (`missing-markup`, `popup-blocked`) and caller shows user-facing toast.

Security detail:

- Print header text values are HTML-escaped before injection.

### 2.3 Dynamic QR Logic (Screen vs. Print)

Implemented inside `IncomingTransmittalSlip` via `isPrint`:

- Preview (`isPrint = false`):
  - QR size: 50
  - QR wrapper width: 100
- Print (`isPrint = true`):
  - QR size: 80
  - QR wrapper width: 120

This keeps screen preview compact while preserving scan reliability on printed slips.

### 2.4 Consistent React-Bootstrap Modal Flows

Major lifecycle actions are modal-driven in `DocumentDetail`:

- Endorse to OPM
- PM Routing
- Delegate Task / Assign Personnel
- Complete Task & Close Document
- QR Receive Camera

Common pattern across modals:

- explicit open/close handlers
- guarded close while submitting (busy state)
- validation before submit
- asynchronous submit via `updateDocumentStatus`
- success/error toast feedback

## 3. Strict Access Controls and Security

### 3.1 Route-Level Access Controls

Primary implementation:

- src/App.jsx
- src/context/AuthContext.jsx

As-built access model:

- Operator routes: scan, incoming, outgoing, upload, QR scanner
- OPM Assistant routes: assistant review queue
- PM routes: PM routing queue
- Division routes: routed documents
- Admin routes: user management
- Shared routes: dashboard, tracking, document detail

Auth/security mechanics:

- JWT token is stored in local storage.
- API calls go through `authFetch` with `Authorization: Bearer <token>`.
- `401` responses trigger logout and session invalidation.

### 3.2 Main Division vs. Supporting Division Operational Rules

Primary implementation:

- src/pages/DocumentDetail.jsx

Implemented rules:

- Supporting divisions can see transmittal content but cannot print physical slip unless they also satisfy core-role/main-division logic.
- Supporting divisions are strictly locked out from `Complete Task` because completion is gated to main division only.

Effective button visibility logic:

- `Print Slip` button:
  - shown when `canPrintTransmittalSlip && !shouldHidePrintForSupportingDivision`
  - practical result: supporting-only users do not get print access
- `Delegate Task` button:
  - shown only for division role users in routed states and in routed divisions
- `Complete Task` button:
  - shown only when status is routed/acknowledged and user is in main division

### 3.3 Data Integrity and Transition Control

All critical transitions are performed through centralized status updates:

- `updateDocumentStatus(docId, newStatus, extras)` in DocumentContext
- UI performs optimistic update then backend persistence then refetch for canonical state

This keeps transition behavior uniform across endorsement, routing, delegation, QR receive, and closure.

## 4. Data State and Tracking (Audit Trail)

### 4.1 `routingHistory` as the Core Audit Timeline

Primary implementation:

- src/pages/ScanRegister.jsx
- src/pages/DocumentDetail.jsx
- src/pages/OPMEndorsed.jsx

As-built pattern:

- Each major operation appends a new object to `routingHistory` using:
  - `office`
  - `action`
  - `date`
  - `time`
  - `user`
  - `status`
- Existing history is preserved and extended via array spread (`...(doc.routingHistory || [])`).

Audit events currently captured include:

- intake and registration milestones
- OPM assistant endorsement handoff
- PM routing decisions (including method and instructions)
- division QR receipt acknowledgements
- DM delegation events
- completion and closure events

### 4.2 Division Receipt Ledger (`divisionReceipts`)

Primary implementation:

- src/pages/DocumentDetail.jsx
- src/pages/DivisionDocuments.jsx

As-built behavior:

- Digital QR receipt writes per-division record with verifier and timestamp metadata.
- Multiple division acknowledgements are tracked independently.
- Full acknowledgement status is derived from whether every routed division has a corresponding receipt.

### 4.3 QR Scanner as Physical-to-Digital Bridge

Primary implementation:

- src/pages/QRScanner.jsx (lookup/verification)
- src/pages/DocumentDetail.jsx (transactional division receive)

Bridge behavior:

1. Physical document QR (`PPA|<trackingNumber>`) is scanned by camera or entered manually.
2. System resolves digital document record by control/reference number.
3. In division receive context, scan confirmation updates digital receipt records and status progression.
4. Routing timeline reflects that physical handoff was digitally acknowledged.

### 4.4 Monitoring and Traceability Surfaces

Primary implementation:

- src/pages/Tracking.jsx
- src/pages/Reports.jsx
- src/pages/DocumentDetail.jsx

Traceability views:

- global search by control/reference number/subject/sender
- document-level timeline (`routingHistory`) in detail view
- reporting/monitoring log with filters and exports

## 5. Key As-Built File Map

- Stage I intake and registration: src/pages/ScanRegister.jsx
- Stage II-VI lifecycle operations: src/pages/DocumentDetail.jsx
- OPM Assistant and PM queue operations: src/pages/OPMEndorsed.jsx
- Division routed queue: src/pages/DivisionDocuments.jsx
- Shared transmittal source of truth: src/components/IncomingTransmittalSlip.jsx
- Centralized transmittal print utility: src/utils/incomingTransmittalPrint.js
- Auth/session behavior: src/context/AuthContext.jsx
- Document state and persistence orchestration: src/context/DocumentContext.jsx
- App-level role route guards: src/App.jsx

## 6. Current Status Vocabulary (Operational)

The following status values are active in the implemented workflow:

- `Registered`
- `For OPM Assistant Review`
- `Endorsed to OPM`
- `Routed to Division`
- `Received & Acknowledged`
- `Completed`

These statuses drive queue visibility, action buttons, and timeline semantics across the system.
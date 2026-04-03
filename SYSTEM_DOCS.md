# DocTrack System Architecture Document

## Overview

DocTrack is an Electronic Document Management System (EDMS) built with a React/Vite frontend and a Python/Flask backend. It handles the complete lifecycle of document tracking—from scanning, registration, and OCR extraction to OPM endorsement, PM routing, and final division receipt.

The system is designed for an air-gapped or localized internal network setting, saving physical artifacts directly to local or network drives, using robust OCR processing and role-based workflows to streamline physical-to-digital document operations.

---

## 1. High-Level Architecture Stack

### Frontend Stack (Client-side)
* **Core Framework:** React 18, built and bundled via Vite.
* **Routing:** `react-router-dom` (v6) for handling role-based routing (Operator, OPM Assistant, PM, Division, Admin).
* **State Management:** React Context API (`AuthContext`, `DocumentContext`) for global caching.
* **Local Persistence:** `Dexie.js` for IndexedDB, providing offline caching and massive local storage without quota issues.
* **Styling:** Bootstrap 5, React-Bootstrap, and custom `App.css`.
* **Important Libraries:** `tesseract.js` (frontend OCR), `pdfjs-dist`, `html5-qrcode` & `qrcode.react` (QR scanning/generation), `react-to-print` (printing transmittal slips).

### Backend Stack (Server-side API)
* **Core Framework:** Python 3.11/3.12, Flask 3.1.0.
* **Database:** SQLite managed via `Flask-SQLAlchemy` (ORM).
* **Authentication:** `Flask-JWT-Extended` using JWT tokens, passwords hashed with `bcrypt`.
* **OCR / PDF Parsing:** `paddleocr` and `pypdfium2` for backend heavy-lifting document conversion and extraction.
* **Reports Export:** `openpyxl` for exporting system data to Excel.
* **Storage Logic:** Dedicated file storage mechanisms avoiding browser sandboxes by writing directly to `D:\` or configured directory environments via endpoint (`/api/documents/<tracking_number>/files`).

---

## 2. Directory Structure & App Modules

### Backend (`/server`)

The Flask application acts as a JSON REST API and a robust file processing hub.

* **`app.py`**: The application factory. Initializes Flask, configures db connections (SQLite), sets up JWT and CORS, ensures lightweight schema tweaks if needed, and registers the route blueprints.
* **`models.py`**: Declares two main SQLAlchemy endpoints:
  * `User`: Stores user data, including hashed passwords, roles, divisions, and positions.
  * `Document`: Defines the document object logic. Uses specialized structural fields (`tracking_number`, `status`, etc.) and dynamic payload storage fields (`extra_data`, `routing_history`, `division_receipts_json`) to safely handle extensible JSON configurations.
* **`seed.py`**: Initializer to seed default tables/Admin users if necessary.
* **`/routes`**: Includes the application Blueprint endpoints:
  * `auth.py`: Login handling and JWT generation.
  * `users.py`: CRUD operations for system users and role assignment.
  * `documents.py`: The heart of the tracking system. Handles document creation, payload restructuring (splitting standard vs dynamic JSON fields like `extra_data`), and file-saving operations. Incorporates specific disk-save functions that create nested folders named by `tracking_number` to deposit artifacts like PDFs and PNG stamps.
  * `ocr.py`: Interfaces with the PaddleOCR / native document engines to parse inbound pdf/images and extract structured intelligence (sender, dates, subjects).
  * `reports.py`: Generation of system data views that Operators or Admins can filter or export.

### Frontend (`/src`)

The SPA (Single Page Application) built with React presents targeted pages exclusively based on the JWT `systemRole`.

* **`App.jsx`**: The core Router that applies `guardRoute` logic based on user roles (Operator, OPM Assistant, PM, Division, Admin).
* **`/context`**: 
  * `AuthContext.jsx`: Provides login/out functions and exposes the current `user` object to the component tree.
  * `DocumentContext.jsx`: Interacts tightly with both `/api/documents` and `db.js`.
* **`/utils`**:
  * `db.js`: Dexie wrapper mapped to `doctrackDB`. Manages `documents` index storage so the client can perform fast UI operations.
  * `ocrEngine.js`: Front-end fallback/helper script for OCR execution.
* **`/pages`**: Role-centric views mappings:
  * `ScanRegister.jsx`: Intake process view. Handles OCR reviews, PDF generation, assignment of tracking numbers, and initial REST `/api/documents` post.
  * `OPMEndorsed.jsx`: Dedicated queue/review page explicitly for OPM Assistant and Port Manager (PM) roles for verifying input logic and generating instructional routing directives.
  * `TransmittalSlip.jsx`: Page designed specifically for printing out tracking routing/sticker logic.
  * `QRScanner.jsx`: Allows Operator desk/division users to quick-scan physical QR stickers to update digital states.
  * `Tracking.jsx` / `DocumentDetail.jsx`: Global search and specific history/audit-trail timeline views for reviewing `routingHistory`.
* **`/components`**: Reusable parts (`Sidebar.jsx`, `TopNav.jsx`, `Layout.jsx`, `StatusBadge.jsx`, etc.).

---

## 3. End-To-End System Architecture Workflows

### Phase Setup: Roles
The architecture hinges heavily on system roles:
1. **Operator**: Initializes tracking and handles physical paper scanning and routing stickers.
2. **OPM Assistant**: Verifies data entries created by the Records Operator.
3. **PM (Port Manager / Manager)**: The primary action decision-maker dictating instructions and main/supporting target divisions.
4. **Division**: The endpoint users who receive and sign-off on tracking records.
5. **Admin**: Manages user access and views overview metrics.

### Document Lifecycle (Architecture Flow)
1. **Intake & Scanning (`Stage I`)**:
   * **Source:** Frontend `ScanRegister.jsx` -> File upload.
   * **Action:** Operator processes the file. The OCR endpoints attempt intelligent parsing. The user finalizes metadata. 
   * **Artifacts:** A Tracking/Control number is generated. A payload is sent to `documents.py` to create the SQL row.
   * **File System:** Stamped physical artifacts (like `[tracking-number].pdf`) are saved explicitly through the `/files` endpoint directly to the local machine drive.

2. **OPM Check & Decision (`Stage II & Stage III`)**:
   * The status becomes `For OPM Assistant Review`.
   * It digitally proceeds to the OPM Assistant desk queue, then to PM.
   * PM applies routing lists (targeting `targetDivision` and multiple `targetDivisions`). 
   * Actions update the SQL `routingHistory` JSON column directly.

3. **Division Sign-off (`Stage IV-VI`)**:
   * Using physical QR codes generated early on `TransmittalSlip.jsx`, the division scans/signs for it.
   * System tracks precise time of `divisionReceipts` in a discrete JSON column, keeping SQL flexible without schema migrations.
   * Status resolves to `Completed` / `Terminal`. 

## 4. Design Tenets and Notable Quirks 

- **Smart JSON Columns:** The database (`models.py`) uses `extra_data`, `instruction_comments`, and `division_receipts_json` strings explicitly loaded into JSON via standard `to_dict()` methods instead of highly relational lookup tables. This provides tremendous agility.
- **Aggressive Client-Side Local Caching:** Local IndexedDB instances via `Dexie.js` are used actively to eliminate payload lag on the fast-moving queue pages.
- **Physical Sandboxes Loophole:** Document files are explicitly *not* just blob-saved to Postgres/SQLite. `documents.py` interacts natively with `os.makedirs` referencing `D:\` or configured local endpoints, meaning large scanned PDFs do not bog down the app's SQLite DB footprint, safely remaining on external/scalable volume layers.

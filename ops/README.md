# DocTrack Operations Scripts

## 1) Start production mode

From repository root:

```bat
start_prod.bat
```

What it does:
- builds frontend (`npm run build`)
- starts backend in production mode on port `3001`
- serves frontend static build on port `3000`

## 2) Configure firewall (one-time, run as Administrator)

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\setup-firewall.ps1
```

This opens inbound TCP ports `3000` and `3001` for **Private** networks only.

## 3) Run backup manually

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\backup-doctrack.ps1
```

Defaults:
- backup folder: `C:\DocTrackBackups`
- retention: `30` days
- document files path: `D:\DocTrack Files`

Example custom options:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\backup-doctrack.ps1 -BackupRoot "E:\DocTrackBackups" -RetentionDays 14 -StorageDrive "D:" -StorageFolder "DocTrack Files"
```

## 4) Configure automatic daily backup (recommended)

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\setup-backup-schedule.ps1 -Time "18:00"
```

Optional custom schedule and immediate first run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\setup-backup-schedule.ps1 -TaskName "DocTrack Daily Backup" -Time "17:30" -BackupRoot "C:\DocTrackBackups" -RetentionDays 30 -StorageDrive "D:" -StorageFolder "DocTrack Files" -RunNow
```

To verify task:

```powershell
Get-ScheduledTask -TaskName "DocTrack Daily Backup" | Format-List TaskName,State
Get-ScheduledTaskInfo -TaskName "DocTrack Daily Backup" | Format-List LastRunTime,LastTaskResult,NextRunTime
```

Recommended dual-schedule setup for 6:00 PM duty end:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\setup-backup-schedule.ps1 -TaskName "DocTrack Daily Backup" -Time "17:30"
powershell -ExecutionPolicy Bypass -File .\ops\setup-backup-schedule.ps1 -TaskName "DocTrack Daily Backup (Final)" -Time "18:05"
```

## 5) Suggested daily workflow

1. Start system using `start_prod.bat`
2. Verify LAN access from another workstation
3. Run backup at end-of-day

## 6) One-click manual backup (last operator)

Use the root shortcut:

```bat
backup_now.bat
```

This triggers `ops\backup-doctrack.ps1` immediately and shows success/failure in the window.

## 7) Verify realtime notifications (UAT)

Use the checklist:

```text
ops\realtime-uat-checklist.md
```

Run this after network changes or major updates to confirm instant cross-client notifications still work.

## 8) Enable HTTPS on LAN for QR camera (Chrome)

Chrome blocks camera on plain HTTP origins from other devices. Enable HTTPS for DocTrack LAN:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\setup-lan-https.ps1 -LanIp "10.2.6.70"
```

Then start normally with `start.bat` or `start_prod.bat`.
If `.cert\doctrack-lan.pfx` exists, frontend auto-runs in HTTPS mode.

Important for every client PC:
- import `.cert\doctrack-lan.cer` into `Trusted Root Certification Authorities` (Current User or Local Machine)
- open `https://10.2.6.70:3000`
- allow camera permission in Chrome when prompted

Client install options (run on each laptop/PC):

Option A (client has a local copy of this repo):

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\install-lan-cert.ps1 -CertificatePath .\.cert\doctrack-lan.cer
```

Option B (client does NOT have this repo):
1. Copy `.cert\doctrack-lan.cer` from host PC to the client (USB, shared folder, etc.)
2. Run:

```powershell
Import-Certificate -FilePath "C:\Temp\doctrack-lan.cer" -CertStoreLocation "Cert:\CurrentUser\Root"
```

Option C (direct network share path, only if the host folder is shared and reachable):

```powershell
Import-Certificate -FilePath "\\10.2.6.70\doctrack-ui\.cert\doctrack-lan.cer" -CertStoreLocation "Cert:\CurrentUser\Root"
```

Option D (recommended: create a dedicated cert share on host PC):

On host PC (run as Administrator):

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\setup-lan-cert-share.ps1 -LanIp "10.2.6.70"
```

On each client PC:

```powershell
Import-Certificate -FilePath "\\10.2.6.70\DocTrackCert\doctrack-lan.cer" -CertStoreLocation "Cert:\CurrentUser\Root"
```

Option E (no file sharing needed, easiest):

On each client PC:

```powershell
$certOut = "$env:TEMP\doctrack-lan.cer"
Invoke-WebRequest -Uri "http://10.2.6.70:3001/api/auth/lan-cert" -OutFile $certOut
Import-Certificate -FilePath $certOut -CertStoreLocation "Cert:\CurrentUser\Root"
```

Without importing the cert, Chrome may still show certificate warnings and camera can remain blocked.

If Chrome still says `Not secure` after import:
- ensure URL is exactly `https://10.2.6.70:3000` (not `http://10.2.6.70:3000`)
- close any old frontend terminal/window that was started before HTTPS setup
- start again with `start.bat` so frontend serves HTTPS

# Realtime Notification UAT (2 Clients)

## Goal
Confirm that a document action on Client A appears on Client B without manual refresh.

## Preconditions
- Backend running on LAN (`http://<host-ip>:3001`)
- Frontend running on LAN (`http://<host-ip>:3000`)
- Two browsers/devices on same Wi-Fi/LAN
- Two different active accounts (example: Operator + OPM/PM/Division)

## Test 1: New pending item appears instantly
1. On Client A, login as Operator and open Incoming/Scan flow.
2. On Client B, login as OPM (or PM/Division target role) and stay on queue/dashboard.
3. On Client A, perform action that changes document state into Client B queue.
4. Observe Client B:
   - Bell badge increments.
   - Notification item appears in dropdown.
   - Toast appears with sound.
   - No page refresh is needed.

Pass criteria:
- Update appears within 1-3 seconds under normal LAN conditions.

## Test 2: Click-through behavior
1. On Client B, open bell dropdown.
2. Click the new notification item.

Pass criteria:
- App navigates to the correct document detail page.

## Test 3: Reminder cadence
1. Keep at least one pending item in Client B queue.
2. Do not acknowledge/complete it.

Pass criteria:
- Reminder toast repeats every 60 seconds.
- Reminder sound plays in multi-pulse pattern.

## Test 4: Fallback polling resilience
1. Disconnect and reconnect Client B network briefly (or close/reopen tab).
2. Trigger another document update from Client A.

Pass criteria:
- Notifications resume after reconnect.
- Bell/queue state stays consistent.

## Quick troubleshooting
- If no instant updates: verify backend route `/api/realtime/stream` is reachable and token is valid.
- If no sound: check browser autoplay permission and tab audio mute state.
- If delayed updates: confirm both clients point to same LAN host and not mixed localhost/LAN URLs.

const escapeHtml = (value) => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function openIncomingTransmittalPrintWindow({
  trackingNumber,
  subject,
  transmittalMarkup,
}) {
  if (!transmittalMarkup) {
    return { ok: false, reason: 'missing-markup' }
  }

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    return { ok: false, reason: 'popup-blocked' }
  }

  const safeTrackingNumber = escapeHtml(trackingNumber || '')
  const safeSubject = escapeHtml(subject || 'Untitled')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Transmittal Slip - ${safeTrackingNumber}</title>
  <style>
    body {
      margin: 0;
      background: #f0f0f0;
      font-family: Arial, sans-serif;
    }

    .print-wrapper {
      max-width: 820px;
      margin: 20px auto;
      background: #fff;
      padding: 20px;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.12);
    }

    .toolbar {
      background: #f5f5f5;
      border-bottom: 1px solid #ddd;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      margin: -20px -20px 16px -20px;
    }

    .toolbar button {
      padding: 6px 16px;
      font-size: 13px;
      border: 1px solid #002868;
      background: #002868;
      color: #fff;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
    }

    .toolbar button:hover {
      background: #001a4d;
    }

    .toolbar span {
      font-size: 13px;
      color: #555;
    }

    .slip-container {
      display: flex;
      justify-content: center;
      padding: 0;
    }

    .incoming-transmittal-slip {
      --transmittal-slip-width: 7.85in;
      --transmittal-slip-font-size: 8pt;
      --transmittal-slip-line-height: 1.28;
    }

    @media print {
      @page {
        size: letter;
        margin: 0.5in;
      }

      .toolbar {
        display: none !important;
      }

      body {
        margin: 0;
        padding: 0;
        background: #fff;
      }

      .print-wrapper {
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: none !important;
        max-width: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="print-wrapper">
    <div class="toolbar">
      <button onclick="window.print()">Print Transmittal Slip</button>
      <span>Preview - ${safeTrackingNumber} - ${safeSubject}</span>
    </div>
    <div class="slip-container">
      ${transmittalMarkup}
    </div>
  </div>
</body>
</html>`

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()

  return { ok: true }
}

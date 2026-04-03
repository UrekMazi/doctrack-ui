import os
os.environ["FLAGS_use_onednn"] = "0"
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ["FLAGS_enable_pir_api"] = "0"
from paddleocr import PaddleOCR

import logging
import re
import tempfile
import traceback
from datetime import datetime
from statistics import median
from threading import Lock

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

try:
    import pypdfium2 as pdfium
except ImportError:
    pdfium = None


ocr_bp = Blueprint('ocr', __name__)
logger = logging.getLogger(__name__)

_ocr_engine = None
_ocr_engine_lock = Lock()

SUPPORTED_EXTENSIONS = {'.pdf', '.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp', '.webp'}

FIELD_PATTERNS = {
    'subject': re.compile(r'^\s*(?:SUBJECT|RE)\b\s*[:\-]?\s*(.*)$', re.IGNORECASE),
    'sender': re.compile(r'^\s*FROM\b\s*[:\-]?\s*(.*)$', re.IGNORECASE),
    'for': re.compile(r'^\s*FOR\b\s*[:\-]?\s*(.*)$', re.IGNORECASE),
    'thru': re.compile(r'^\s*THRU\b\s*[:\-]?\s*(.*)$', re.IGNORECASE),
    'dateOfComm': re.compile(
        r'^\s*DATE(?:\s+OF\s+COMM(?:UNICATION)?)?\b\s*[:\-]?\s*(.*)$',
        re.IGNORECASE,
    ),
}

STOP_LABEL_PATTERN = re.compile(
    r'^\s*(?:SUBJECT|FROM|FOR|DATE(?:\s+OF\s+COMM(?:UNICATION)?)?|TO|THRU|CC|ATTN|REFERENCE|REF\.?|ACTION)\b',
    re.IGNORECASE,
)

PLACEHOLDER_VALUE_PATTERN = re.compile(r'^[\s:;\-–—_|.,]*$')

DATE_TOP_FALLBACK_PATTERN = re.compile(
    r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}',
    re.IGNORECASE,
)

DATE_TOP_FALLBACK_COMPACT_PATTERN = re.compile(
    r'(January|February|March|April|May|June|July|August|September|October|November|December)(\d{1,2}),(\d{4})',
    re.IGNORECASE,
)

DATE_SNIPPET_PATTERN = re.compile(
    r'(\d{4}[\/-]\d{1,2}[\/-]\d{1,2}'
    r'|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}'
    r'|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?'
    r'|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{2,4}'
    r'|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?'
    r'|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{2,4})',
    re.IGNORECASE,
)

DOC_TYPE_MEMO_PATTERN = re.compile(r'\bMEMORANDUM\b', re.IGNORECASE)
DOC_TYPE_AUTHORITY_PATTERN = re.compile(r'\bAUTHORITY\s+TO\s+PAY\b', re.IGNORECASE)


def _get_ocr_engine():
    global _ocr_engine
    if _ocr_engine is None:
        with _ocr_engine_lock:
            if _ocr_engine is None:
                _ocr_engine = PaddleOCR(use_angle_cls=True, lang='en')
    return _ocr_engine


def _normalize_space(value):
    return re.sub(r'\s+', ' ', str(value or '')).strip()


def _guess_extension(filename, mimetype):
    ext = os.path.splitext(filename or '')[1].lower()
    if ext in SUPPORTED_EXTENSIONS:
        return ext

    media = (mimetype or '').lower()
    if 'pdf' in media:
        return '.pdf'
    if 'png' in media:
        return '.png'
    if 'jpeg' in media or 'jpg' in media:
        return '.jpg'
    if 'tiff' in media:
        return '.tiff'
    if 'bmp' in media:
        return '.bmp'
    if 'webp' in media:
        return '.webp'
    return ext


def _bbox_metrics(bbox):
    xs = []
    ys = []
    if not isinstance(bbox, (list, tuple)):
        return 0.0, 0.0, 0.0

    for point in bbox:
        if isinstance(point, (list, tuple)) and len(point) >= 2:
            try:
                xs.append(float(point[0]))
                ys.append(float(point[1]))
            except (TypeError, ValueError):
                continue

    if not xs or not ys:
        return 0.0, 0.0, 0.0

    y_center = (min(ys) + max(ys)) / 2.0
    x_left = min(xs)
    height = max(ys) - min(ys)
    return y_center, x_left, height


def _is_bbox(value):
    if not isinstance(value, (list, tuple)) or len(value) < 4:
        return False
    sample_point = value[0]
    return isinstance(sample_point, (list, tuple)) and len(sample_point) >= 2


def _is_line_payload(value):
    if not isinstance(value, (list, tuple)) or len(value) < 2:
        return False
    return _is_bbox(value[0])


def _iter_ocr_pages(ocr_result):
    if ocr_result is None:
        return

    # Flat line payload (single page) fallback.
    if isinstance(ocr_result, (list, tuple)) and ocr_result and _is_line_payload(ocr_result[0]):
        yield ocr_result
        return

    if _is_line_payload(ocr_result):
        yield [ocr_result]
        return

    if not isinstance(ocr_result, (list, tuple)):
        return

    for page in ocr_result:
        if not page:
            continue

        if _is_line_payload(page):
            yield [page]
            continue

        if isinstance(page, (list, tuple)):
            yield page


def _flatten_page_tokens(page_lines):
    tokens = []
    if not isinstance(page_lines, (list, tuple)):
        return tokens

    for line in page_lines:
        if not _is_line_payload(line):
            continue

        # Expected shape: [bbox, (text, confidence)]
        try:
            bbox, text_info = line
        except (ValueError, TypeError):
            continue

        if isinstance(text_info, (list, tuple)):
            if len(text_info) >= 2:
                text, _score = text_info[0], text_info[1]
            elif len(text_info) == 1:
                text, _score = text_info[0], None
            else:
                continue
        else:
            text, _score = text_info, None

        text = _normalize_space(text)
        if not text:
            continue

        y_center, x_left, height = _bbox_metrics(bbox)
        tokens.append({
            'text': text,
            'x': x_left,
            'y': y_center,
            'height': height,
        })

    return tokens


def _flatten_ocr_tokens(ocr_result):
    tokens = []
    for page in _iter_ocr_pages(ocr_result):
        tokens.extend(_flatten_page_tokens(page))
    return tokens


def _line_has_main_doc_marker(line):
    normalized = _normalize_space(line)
    if not normalized:
        return False
    upper = normalized.upper()
    squashed = re.sub(r'\s+', '', upper)
    return 'MEMORANDUM' in upper or 'AUTHORITY TO PAY' in upper or 'AUTHORITYTOPAY' in squashed


def _find_main_page(ocr_result):
    first_page = None
    page_summaries = []

    for index, page in enumerate(_iter_ocr_pages(ocr_result)):
        page_tokens = _flatten_page_tokens(page)
        page_lines = _tokens_to_lines(page_tokens)
        has_doc_marker = any(_line_has_main_doc_marker(line) for line in page_lines)

        page_summaries.append({
            'index': index,
            'containsDocType': has_doc_marker,
            'rows': len(page_lines),
            'tokens': len(page_tokens),
        })

        if first_page is None:
            first_page = {
                'index': index,
                'tokens': page_tokens,
                'lines': page_lines,
            }

        # Strict isolation: first page that contains MEMORANDUM or AUTHORITY TO PAY.
        if has_doc_marker:
            return {
                'index': index,
                'tokens': page_tokens,
                'lines': page_lines,
                'page_summaries': page_summaries,
            }

    if first_page is not None:
        first_page['page_summaries'] = page_summaries
        return first_page

    return {
        'index': 0,
        'tokens': [],
        'lines': [],
        'page_summaries': page_summaries,
    }


def _tokens_to_lines(tokens):
    if not tokens:
        return []

    heights = [tok['height'] for tok in tokens if tok['height'] > 0]
    # Keep row grouping tolerance in the 10-15px window for skewed scans.
    median_height = median(heights) if heights else 0.0
    adaptive_tolerance = median_height * 0.7 if median_height else 12.0
    y_tolerance = max(10.0, min(15.0, adaptive_tolerance))

    # Geographic reconstruction: sort by Y first, then place each token into the nearest
    # compatible horizontal row bucket; this fixes column-by-column OCR ordering.
    ordered = sorted(tokens, key=lambda tok: (tok['y'], tok['x']))
    row_buckets = []

    for token in ordered:
        best_bucket = None
        best_distance = None

        for bucket in row_buckets:
            distance = abs(token['y'] - bucket['y'])
            if distance <= y_tolerance and (best_distance is None or distance < best_distance):
                best_bucket = bucket
                best_distance = distance

        if best_bucket is None:
            row_buckets.append({'y': token['y'], 'tokens': [token]})
            continue

        best_bucket['tokens'].append(token)
        token_count = len(best_bucket['tokens'])
        best_bucket['y'] = ((best_bucket['y'] * (token_count - 1)) + token['y']) / token_count

    row_buckets.sort(key=lambda bucket: bucket['y'])

    lines = []
    for bucket in row_buckets:
        ordered_row = sorted(bucket['tokens'], key=lambda tok: tok['x'])
        line_text = _normalize_space(' '.join(tok['text'] for tok in ordered_row))
        if line_text:
            lines.append(line_text)

    return lines


def _reconstruct_rows_from_ocr_result(ocr_result):
    """Convert the selected main page OCR blocks into row-by-row text strings."""
    main_page = _find_main_page(ocr_result)
    return main_page.get('lines', [])


def _is_truthy(value):
    return str(value or '').strip().lower() in {'1', 'true', 'yes', 'on', 'y'}


def _safe_int(value, fallback):
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _log_ocr_debug(tokens, lines, extracted_fields, main_page_index=0, page_summaries=None):
    max_rows = max(1, _safe_int(os.environ.get('DOCTRACK_OCR_DEBUG_MAX_ROWS'), 25))
    max_tokens = max(1, _safe_int(os.environ.get('DOCTRACK_OCR_DEBUG_MAX_TOKENS'), 50))
    max_pages = max(1, _safe_int(os.environ.get('DOCTRACK_OCR_DEBUG_MAX_PAGES'), 10))

    logger.info(
        '[OCR DEBUG] main_page=%s page_count=%s token_count=%s row_count=%s extracted=%s',
        main_page_index,
        len(page_summaries or []),
        len(tokens or []),
        len(lines or []),
        extracted_fields,
    )

    for page_summary in (page_summaries or [])[:max_pages]:
        logger.info(
            '[OCR DEBUG] page_%02d contains_doc_type=%s rows=%s tokens=%s',
            int(page_summary.get('index', 0)) + 1,
            page_summary.get('containsDocType', False),
            page_summary.get('rows', 0),
            page_summary.get('tokens', 0),
        )

    # Row-level view is the most useful signal for column-vs-row ordering checks.
    for idx, line in enumerate((lines or [])[:max_rows], start=1):
        logger.info('[OCR DEBUG] row_%02d=%s', idx, line)

    # Token preview with coordinates helps diagnose grouping/tolerance issues.
    ordered_tokens = sorted(tokens or [], key=lambda tok: (tok.get('y', 0), tok.get('x', 0)))
    for idx, token in enumerate(ordered_tokens[:max_tokens], start=1):
        logger.info(
            '[OCR DEBUG] token_%02d y=%.1f x=%.1f h=%.1f text=%s',
            idx,
            float(token.get('y', 0.0)),
            float(token.get('x', 0.0)),
            float(token.get('height', 0.0)),
            token.get('text', ''),
        )


def _is_placeholder_value(text):
    value = _normalize_space(text)
    if not value:
        return True
    if PLACEHOLDER_VALUE_PATTERN.match(value):
        return True
    # Single-character OCR fragments are usually separators, not values.
    compact = re.sub(r'[^A-Za-z0-9]+', '', value)
    return len(compact) <= 1 and len(value) <= 3


def _clean_extracted_line(text):
    value = _normalize_space(text)
    if not value:
        return ''

    # Strip leading OCR punctuation artifacts like ":" or "-" before content.
    value = re.sub(r'^[\s:;\-–—]+', '', value)
    value = _normalize_space(value)
    if not value:
        return ''

    # Recover missing spaces in glued title words (e.g., "ThePORT" -> "The PORT").
    value = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', value)
    return _normalize_space(value)


import re


def _extract_fields_strict(text_lines):
    extracted = {
        'docType': '', 'forName': '', 'forDivision': '',
        'thruName': '', 'thruDivision': '', 'sender': '',
        'senderDivision': '', 'subject': '', 'dateOfComm': ''
    }

    last_header_idx = -1

    for i, line in enumerate(text_lines):
        line_upper = line.upper()

        # Doc Type
        if "MEMORANDUM" in line_upper and not extracted['docType']:
            extracted['docType'] = "Memorandum"
        elif "AUTHORITY TO PAY" in line_upper and not extracted['docType']:
            extracted['docType'] = "Authority to Pay"

        # Safe Date Extractor (Bypasses Timezone Shifts by forcing YYYY-MM-DD)
        if i < 15 and not extracted['dateOfComm']:
            # Match Month DD, YYYY
            match1 = re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})", line, re.IGNORECASE)
            # Match DD Month YYYY
            match2 = re.search(r"(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})", line, re.IGNORECASE)
            
            if match1 or match2:
                if match1:
                    month_str, day_str, year_str = match1.group(1)[:3].capitalize(), match1.group(2).zfill(2), match1.group(3)
                else:
                    day_str, month_str, year_str = match2.group(1).zfill(2), match2.group(2)[:3].capitalize(), match2.group(3)
                
                months = {'Jan':'01', 'Feb':'02', 'Mar':'03', 'Apr':'04', 'May':'05', 'Jun':'06', 'Jul':'07', 'Aug':'08', 'Sep':'09', 'Oct':'10', 'Nov':'11', 'Dec':'12'}
                extracted['dateOfComm'] = f"{year_str}-{months.get(month_str, '01')}-{day_str}"

        # FOR
        if line_upper.startswith("FOR ") and not extracted['forName']:
            extracted['forName'] = line[4:].replace(":", "").strip()
            last_header_idx = i
            if i + 1 < len(text_lines):
                extracted['forDivision'] = text_lines[i+1].strip()
                last_header_idx = i + 1

        # FROM
        elif line_upper.startswith("FROM ") and not extracted['sender']:
            extracted['sender'] = line[5:].replace(":", "").strip()
            last_header_idx = i
            if i + 1 < len(text_lines):
                extracted['senderDivision'] = text_lines[i+1].strip()
                last_header_idx = i + 1

        # THRU
        elif line_upper.startswith("THRU ") and not extracted['thruName']:
            extracted['thruName'] = line[5:].replace(":", "").strip()
            last_header_idx = i
            if i + 1 < len(text_lines):
                extracted['thruDivision'] = text_lines[i+1].strip()
                last_header_idx = i + 1

        # SUBJECT
        elif line_upper.startswith("SUBJECT") and not extracted['subject']:
            subj_text = line.replace("SUBJECT", "").replace(":", "").strip()
            # Look ahead for multi-line subject (append next line if it doesn't start a new paragraph)
            if i + 1 < len(text_lines):
                next_line = text_lines[i+1].strip()
                if next_line and not next_line.upper().startswith(("RESPECTFULLY", "IN REFERENCE", "AUTHORITY")):
                    subj_text += " " + next_line
            extracted['subject'] = subj_text
            last_header_idx = i + 1

    # FALLBACK: If Subject is entirely missing from the document, Auto-Extract Body Text
    if not extracted['subject']:
        start_search = last_header_idx + 1 if last_header_idx != -1 else 0
        body_text = []
        for i in range(start_search, len(text_lines)):
            line = text_lines[i].strip()
            if not line or len(line) < 15:
                continue
                
            line_upper = line.upper()
            if line_upper.startswith(("MEMORANDUM", "AUTHORITY", "DATE", "CONTROL")):
                continue
                
            body_text.append(line)
            if i + 1 < len(text_lines) and len(text_lines[i+1].strip()) > 10:
                body_text.append(text_lines[i+1].strip())
            break
            
        if body_text:
            combined = " ".join(body_text)
            snippet = combined[:120] + "..." if len(combined) > 120 else combined
            extracted['subject'] = f"[Auto-extracted] {snippet}"

    return extracted


def _normalize_date(raw_value):
    raw = _normalize_space(raw_value)
    if not raw:
        return ''

    match = DATE_SNIPPET_PATTERN.search(raw)
    candidate = _normalize_space(match.group(1) if match else raw)
    candidate = candidate.replace('.', '/').replace('\\', '/').strip()

    # Expand 2-digit years where possible.
    compact_year = re.search(r'([\/-])(\d{2})$', candidate)
    if compact_year:
        year = int(compact_year.group(2))
        century = 2000 if year < 70 else 1900
        candidate = f"{candidate[:-2]}{century + year}"

    formats = (
        '%Y-%m-%d', '%Y/%m/%d',
        '%m/%d/%Y', '%m-%d-%Y',
        '%d/%m/%Y', '%d-%m-%Y',
        '%B %d, %Y', '%b %d, %Y',
        '%d %B %Y', '%d %b %Y',
    )

    for fmt in formats:
        try:
            return datetime.strptime(candidate, fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue

    return raw


def _prepare_ocr_input(file_path, extension):
    if extension != '.pdf':
        return file_path

    if pdfium is None:
        raise RuntimeError('PDF OCR requires pypdfium2. Install it with: pip install pypdfium2')

    pdf = pdfium.PdfDocument(file_path)
    try:
        if len(pdf) < 1:
            raise ValueError('Uploaded PDF has no pages.')

        images = []
        for page_index in range(len(pdf)):
            page = pdf[page_index]
            bitmap = page.render(scale=2.0)
            image = bitmap.to_numpy()

            if image is None:
                continue

            # Strip alpha channel if present.
            if getattr(image, 'ndim', 0) == 3 and image.shape[-1] == 4:
                image = image[:, :, :3]

            images.append(image)

        if not images:
            raise ValueError('Failed to rasterize any PDF pages for OCR.')

        return images
    finally:
        pdf.close()


@ocr_bp.route('/extract', methods=['POST'])
@jwt_required()
def extract_metadata():
    upload = request.files.get('file')
    if upload is None:
        return jsonify({'error': 'file is required in multipart/form-data'}), 400

    extension = _guess_extension(upload.filename, upload.mimetype)
    if extension not in SUPPORTED_EXTENSIONS:
        return jsonify({'error': 'Unsupported file type. Use PDF, PNG, JPG, TIFF, BMP, or WEBP.'}), 400

    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as temp_file:
            upload.save(temp_file.name)
            temp_path = temp_file.name

        ocr_input = _prepare_ocr_input(temp_path, extension)
        engine = _get_ocr_engine()
        result = []
        if isinstance(ocr_input, list):
            for img in ocr_input:
                page_res = engine.ocr(img)
                if page_res and len(page_res) > 0:
                    result.append(page_res[0])
        else:
            result = engine.ocr(ocr_input)

        debug_enabled = _is_truthy(os.environ.get('DOCTRACK_OCR_DEBUG')) or _is_truthy(request.args.get('debug'))
        main_page = _find_main_page(result)
        tokens = main_page.get('tokens', [])
        text_lines = main_page.get('lines', [])
        main_page_index = main_page.get('index', 0)
        page_summaries = main_page.get('page_summaries', [])

        print("\n--- RAW OCR LINES ---")
        for i, line in enumerate(text_lines):
            print(f"[{i}] {line}")
        print("---------------------\n")

        extracted = _extract_fields_strict(text_lines)

        if debug_enabled:
            try:
                _log_ocr_debug(
                    tokens,
                    text_lines,
                    {
                        'docType': extracted.get('docType', ''),
                        'forName': extracted.get('forName', ''),
                        'forDivision': extracted.get('forDivision', ''),
                        'thruName': extracted.get('thruName', ''),
                        'thruDivision': extracted.get('thruDivision', ''),
                        'subject': extracted.get('subject', ''),
                        'sender': extracted.get('sender', ''),
                        'senderDivision': extracted.get('senderDivision', ''),
                        'dateOfComm': extracted.get('dateOfComm', ''),
                    },
                    main_page_index=main_page_index,
                    page_summaries=page_summaries,
                )
            except Exception as debug_exc:
                logger.warning('[OCR DEBUG] failed to log debug output: %s', debug_exc)

        # Keep the frontend contract simple and stable.
        return jsonify({
            'docType': extracted.get('docType', ''),
            'forName': extracted.get('forName', ''),
            'forDivision': extracted.get('forDivision', ''),
            'thruName': extracted.get('thruName', ''),
            'thruDivision': extracted.get('thruDivision', ''),
            'sender': extracted.get('sender', ''),
            'senderDivision': extracted.get('senderDivision', ''),
            'subject': extracted.get('subject', ''),
            'dateOfComm': extracted.get('dateOfComm', ''),
        }), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({
            'error': 'OCR Processing Failed',
            'details': str(e),
        }), 500
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass

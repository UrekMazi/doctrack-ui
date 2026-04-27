"""Document CRUD routes"""
import json
import os
import uuid
import logging
from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from models import db, Document, User
from realtime_events import publish_event

documents_bp = Blueprint('documents', __name__)
logger = logging.getLogger(__name__)

DEFAULT_STORAGE_FOLDER = os.environ.get('DOCTRACK_STORAGE_FOLDER', 'DocTrack Files')
LEGACY_STORAGE_ROOT = 'D:\\'
PRIMARY_STORAGE_ROOT = os.environ.get('DOCTRACK_STORAGE_ROOT_PRIMARY', '').strip()
FALLBACK_STORAGE_ROOT = os.environ.get('DOCTRACK_STORAGE_ROOT_FALLBACK', LEGACY_STORAGE_ROOT).strip() or LEGACY_STORAGE_ROOT
MAX_COMPLETION_PROOF_BYTES = 25 * 1024 * 1024


def _resolve_max_scan_upload_bytes():
    try:
        parsed_mb = int(os.environ.get('DOCTRACK_MAX_SCAN_UPLOAD_MB', '300'))
    except (TypeError, ValueError):
        parsed_mb = 300
    parsed_mb = max(10, parsed_mb)
    return parsed_mb * 1024 * 1024


MAX_SCAN_UPLOAD_BYTES = _resolve_max_scan_upload_bytes()


def _resolve_onedrive_root():
    configured = os.environ.get('DOCTRACK_ONEDRIVE_ROOT', '').strip()
    if configured:
        return configured

    for env_name in ('OneDriveCommercial', 'OneDriveConsumer', 'OneDrive', 'ONEDRIVE'):
        candidate = os.environ.get(env_name, '').strip()
        if candidate:
            return candidate

    user_profile = os.environ.get('USERPROFILE', '').strip()
    if user_profile:
        return os.path.join(user_profile, 'OneDrive')

    return ''


def _unique_storage_roots(candidates):
    unique = []
    seen = set()

    for root in candidates:
        clean = str(root or '').strip()
        if not clean:
            continue

        normalized = os.path.normcase(os.path.normpath(clean))
        if normalized in seen:
            continue

        seen.add(normalized)
        unique.append(clean)

    return unique


def _candidate_storage_roots():
    primary = PRIMARY_STORAGE_ROOT or _resolve_onedrive_root()
    return _unique_storage_roots([primary, FALLBACK_STORAGE_ROOT, LEGACY_STORAGE_ROOT])


def _select_storage_base_root():
    candidates = _candidate_storage_roots()
    if not candidates:
        return LEGACY_STORAGE_ROOT

    for index, candidate in enumerate(candidates):
        if index == len(candidates) - 1:
            return candidate

        if os.path.isdir(candidate):
            return candidate

        logger.info('Storage root unavailable, trying fallback root: %s', candidate)

    return candidates[-1]


def sanitize_storage_folder(folder_name):
    raw = (folder_name or '').strip()
    if not raw:
        raw = DEFAULT_STORAGE_FOLDER

    # Allow only safe folder-name characters to avoid path traversal.
    safe = ''.join(ch for ch in raw if ch.isalnum() or ch in (' ', '-', '_')).strip().rstrip('.')
    return safe or DEFAULT_STORAGE_FOLDER


def get_storage_root_candidates(folder_name=None):
    resolved_folder = sanitize_storage_folder(folder_name)
    candidates = []

    for index, base_root in enumerate(_candidate_storage_roots()):
        storage_root = os.path.join(base_root, resolved_folder)
        candidates.append({
            'index': index,
            'base_root': base_root,
            'storage_root': storage_root,
            'storage_folder': resolved_folder,
            'fallback_used': index > 0,
        })

    if not candidates:
        storage_root = os.path.join(LEGACY_STORAGE_ROOT, resolved_folder)
        candidates.append({
            'index': 0,
            'base_root': LEGACY_STORAGE_ROOT,
            'storage_root': storage_root,
            'storage_folder': resolved_folder,
            'fallback_used': False,
        })

    return candidates


def get_storage_root(folder_name=None):
    resolved_folder = sanitize_storage_folder(folder_name)
    base_root = _select_storage_base_root()
    return os.path.join(base_root, resolved_folder), resolved_folder


def normalize_optional_date(value, field_name):
    raw = str(value or '').strip()
    if not raw:
        return ''

    if len(raw) >= 10 and raw[4] == '-' and raw[7] == '-':
        try:
            return datetime.strptime(raw[:10], '%Y-%m-%d').strftime('%Y-%m-%d')
        except ValueError as exc:
            raise ValueError(f'{field_name} must be a valid date in YYYY-MM-DD format') from exc

    for fmt in ('%m/%d/%Y', '%d/%m/%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(raw, fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue

    raise ValueError(f'{field_name} must be a valid date in YYYY-MM-DD format')


def normalize_string(value):
    return str(value or '').strip()


def normalize_target_divisions(raw_value):
    if isinstance(raw_value, list):
        source = raw_value
    elif raw_value in (None, ''):
        source = []
    else:
        source = [raw_value]

    cleaned = []
    for item in source:
        text = str(item or '').strip()
        if text and text not in cleaned:
            cleaned.append(text)
    return cleaned


def dumps_or_fallback(value, fallback):
    try:
        return json.dumps(value if value is not None else fallback)
    except TypeError:
        return json.dumps(fallback)


def parse_json_or_fallback(raw_value, fallback):
    try:
        if raw_value in (None, ''):
            return fallback
        parsed = json.loads(raw_value)
        return parsed
    except Exception:
        return fallback


def get_authenticated_user():
    try:
        user_id = int(get_jwt_identity())
    except (TypeError, ValueError):
        return None

    user = db.session.get(User, user_id)
    if not user or not user.is_active:
        return None
    return user


def get_document_target_divisions(doc):
    target_divisions = normalize_target_divisions(parse_json_or_fallback(doc.target_divisions, []))
    target_division = normalize_string(doc.target_division)
    if target_division and target_division not in target_divisions:
        target_divisions.append(target_division)
    return target_divisions


def get_document_assigned_position(doc, division_name):
    clean_division = normalize_string(division_name)
    if not clean_division:
        return ''

    clean_division_lower = clean_division.lower()
    extra_data = parse_json_or_fallback(doc.extra_data, {})

    delegated_division = normalize_string(extra_data.get('assignedDivision')) if isinstance(extra_data, dict) else ''
    delegated_position = normalize_string(extra_data.get('assignedTo')) if isinstance(extra_data, dict) else ''
    if delegated_position and delegated_division and delegated_division.lower() == clean_division_lower:
        return delegated_position

    assignments = extra_data.get('routeAssignments') if isinstance(extra_data, dict) else {}
    if not isinstance(assignments, dict):
        return ''

    for key, payload in assignments.items():
        if normalize_string(key).lower() != clean_division_lower:
            continue
        if not isinstance(payload, dict):
            return ''
        return normalize_string(payload.get('position'))

    return ''


def sanitize_filename(value):
    raw = os.path.basename(str(value or '').strip())
    safe = ''.join(ch for ch in raw if ch.isalnum() or ch in (' ', '-', '_', '.')).strip().rstrip('.')
    return safe[:140]


def sanitize_subject_for_folder(value):
    raw = str(value or '').replace('\r', ' ').replace('\n', ' ')
    raw = ' '.join(raw.split())
    if not raw:
        return ''

    forbidden = set('<>:"/\\|?*')
    safe = ''.join(ch for ch in raw if ord(ch) >= 32 and ch not in forbidden).strip().rstrip('.')
    return safe[:140].rstrip(' .')


def build_document_folder_name(tracking_number, subject=''):
    tracking = normalize_string(tracking_number)
    safe_subject = sanitize_subject_for_folder(subject)
    if not safe_subject:
        return tracking

    max_subject_length = max(20, 150 - len(tracking) - 1)
    if len(safe_subject) > max_subject_length:
        safe_subject = safe_subject[:max_subject_length].rstrip(' .')

    if not safe_subject:
        return tracking

    return f'{tracking}.{safe_subject}'


def infer_extension_from_data_url(header):
    lowered = str(header or '').lower()
    if 'application/pdf' in lowered:
        return '.pdf'
    if 'image/png' in lowered:
        return '.png'
    if 'image/jpeg' in lowered or 'image/jpg' in lowered:
        return '.jpg'
    if 'image/webp' in lowered:
        return '.webp'
    if 'text/plain' in lowered:
        return '.txt'
    return ''


def get_document_main_division(doc):
    extra_data = parse_json_or_fallback(doc.extra_data, {})
    candidates = [
        doc.main_division,
        extra_data.get('mainDivision') if isinstance(extra_data, dict) else '',
        extra_data.get('oprDivision') if isinstance(extra_data, dict) else '',
        doc.target_division,
    ]

    for candidate in candidates:
        clean = normalize_string(candidate)
        if clean:
            return clean
    return ''


def can_user_access_document(doc, user):
    role = normalize_string(user.role)
    if role in {'Admin', 'Operator', 'PM', 'OPM Assistant'}:
        return True

    if role != 'Division':
        return False

    user_division = normalize_string(user.division)
    if not user_division:
        return False

    user_division_lower = user_division.lower()
    target_divisions = get_document_target_divisions(doc)
    sender_division = normalize_string(doc.sender_address)

    routed_to_user = any(normalize_string(division).lower() == user_division_lower for division in target_divisions)
    sent_by_user_division = sender_division.lower() == user_division_lower
    if not routed_to_user and not sent_by_user_division:
        return False

    assigned_position = get_document_assigned_position(doc, user_division)
    if not assigned_position:
        return True

    user_position = normalize_string(user.position)
    if not user_position:
        return False

    return user_position.lower() == assigned_position.lower()


@documents_bp.route('', methods=['GET'])
@jwt_required()
def list_documents():
    user = get_authenticated_user()
    if not user:
        return jsonify({'error': 'Invalid user identity in token'}), 401

    docs = Document.query.order_by(Document.created_at.desc()).all()
    if normalize_string(user.role) == 'Division':
        docs = [doc for doc in docs if can_user_access_document(doc, user)]

    return jsonify({'documents': [d.to_dict() for d in docs]})


@documents_bp.route('/<int:doc_id>', methods=['GET'])
@jwt_required()
def get_document(doc_id):
    user = get_authenticated_user()
    if not user:
        return jsonify({'error': 'Invalid user identity in token'}), 401

    doc = Document.query.get(doc_id)
    if not doc:
        return jsonify({'error': 'Document not found'}), 404

    if not can_user_access_document(doc, user):
        return jsonify({'error': 'Access denied for this document'}), 403

    return jsonify({'document': doc.to_dict()})


@documents_bp.route('', methods=['POST'])
@jwt_required()
def create_document():
    user = get_authenticated_user()
    if not user:
        return jsonify({'error': 'Authenticated user no longer exists'}), 401

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'Invalid JSON payload'}), 400

    tracking_number = normalize_string(data.get('trackingNumber'))
    if not tracking_number:
        return jsonify({'error': 'trackingNumber is required'}), 400

    try:
        due_date = normalize_optional_date(data.get('dueDate'), 'dueDate')
        date_of_comm = normalize_optional_date(data.get('dateOfComm'), 'dateOfComm')
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    target_divisions = normalize_target_divisions(data.get('targetDivisions'))
    target_division = normalize_string(data.get('targetDivision')) or (target_divisions[0] if target_divisions else '')
    action = normalize_string(data.get('action'))

    known_keys = {
        'id', 'trackingNumber', 'dateReceived', 'timeReceived', 'subject', 'sender', 'senderAddress', 'type',
        'status', 'action', 'dueDate', 'dateOfComm', 'remarks', 'targetDivision', 'targetDivisions', 'mainDivision',
        'instructionComments', 'routingHistory', 'divisionReceipts', 'createdBy', 'createdAt', 'updatedAt'
    }
    extra_data_dict = {k: v for k, v in data.items() if k not in known_keys}

    doc = Document(
        tracking_number=tracking_number,
        date_received=normalize_string(data.get('dateReceived')),
        time_received=normalize_string(data.get('timeReceived')),
        subject=normalize_string(data.get('subject')),
        sender=normalize_string(data.get('sender')),
        sender_address=normalize_string(data.get('senderAddress')),
        type=normalize_string(data.get('type')),
        status=normalize_string(data.get('status')) or 'Registered',
        action=action,
        due_date=due_date,
        date_of_comm=date_of_comm,
        remarks=normalize_string(data.get('remarks')),
        target_division=target_division,
        target_divisions=dumps_or_fallback(target_divisions, []),
        main_division=normalize_string(data.get('mainDivision')),
        instruction_comments=dumps_or_fallback(data.get('instructionComments'), []),
        routing_history=dumps_or_fallback(data.get('routingHistory'), []),
        division_receipts_json=dumps_or_fallback(data.get('divisionReceipts'), {}),
        extra_data=dumps_or_fallback(extra_data_dict, {}),
        created_by=user.id,
    )

    try:
        db.session.add(doc)
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        logger.exception('Document create IntegrityError', extra={
            'tracking_number': tracking_number,
            'payload_keys': sorted(list(data.keys())),
        })
        error_text = str(getattr(exc, 'orig', exc)).lower()
        if 'tracking_number' in error_text and 'unique' in error_text:
            return jsonify({'error': 'Control/Reference number already exists. Generate a new number and retry.'}), 409
        return jsonify({'error': 'Document save failed due to a data integrity constraint.'}), 400
    except SQLAlchemyError as exc:
        db.session.rollback()
        logger.exception('Document create SQLAlchemyError', extra={
            'tracking_number': tracking_number,
            'payload_keys': sorted(list(data.keys())),
            'db_error': str(getattr(exc, 'orig', exc)),
        })
        return jsonify({'error': 'Database error while saving document.'}), 500

    publish_event('documents-updated', {
        'docId': doc.id,
        'trackingNumber': doc.tracking_number,
        'action': 'created',
    })

    return jsonify({'document': doc.to_dict(), 'controlNumber': doc.tracking_number}), 201


@documents_bp.route('/<int:doc_id>', methods=['PUT'])
@jwt_required()
def update_document(doc_id):
    user = get_authenticated_user()
    if not user:
        return jsonify({'error': 'Invalid user identity in token'}), 401

    doc = Document.query.get(doc_id)
    if not doc:
        return jsonify({'error': 'Document not found'}), 404

    if not can_user_access_document(doc, user):
        return jsonify({'error': 'Access denied for this document'}), 403

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'Invalid JSON payload'}), 400

    simple_fields = {
        'trackingNumber': 'tracking_number',
        'dateReceived': 'date_received',
        'timeReceived': 'time_received',
        'subject': 'subject',
        'sender': 'sender',
        'senderAddress': 'sender_address',
        'type': 'type',
        'status': 'status',
        'action': 'action',
        'dueDate': 'due_date',
        'dateOfComm': 'date_of_comm',
        'remarks': 'remarks',
        'targetDivision': 'target_division',
        'mainDivision': 'main_division',
    }

    for js_key, db_col in simple_fields.items():
        if js_key in data:
            value = data[js_key]
            if js_key in {'dueDate', 'dateOfComm'}:
                try:
                    value = normalize_optional_date(value, js_key)
                except ValueError as exc:
                    return jsonify({'error': str(exc)}), 400
            elif js_key in {'action', 'targetDivision', 'status', 'subject', 'sender', 'senderAddress', 'type', 'remarks', 'mainDivision', 'trackingNumber', 'dateReceived', 'timeReceived'}:
                value = normalize_string(value)
            setattr(doc, db_col, value)

    json_fields = {
        'targetDivisions': 'target_divisions',
        'instructionComments': 'instruction_comments',
        'routingHistory': 'routing_history',
        'divisionReceipts': 'division_receipts_json',
    }

    for js_key, db_col in json_fields.items():
        if js_key in data:
            if js_key == 'instructionComments':
                incoming = data.get(js_key)
                incoming_list = incoming if isinstance(incoming, list) else []
                existing_list = []
                if doc.instruction_comments:
                    try:
                        parsed = json.loads(doc.instruction_comments)
                        if isinstance(parsed, list):
                            existing_list = parsed
                    except Exception:
                        existing_list = []

                merged = []
                seen = set()
                for entry in [*existing_list, *incoming_list]:
                    if not isinstance(entry, dict):
                        continue
                    key = entry.get('id')
                    if not key:
                        key = f"{entry.get('roleLabel')}-{entry.get('name')}-{entry.get('comment')}-{entry.get('createdAt')}"
                    if key in seen:
                        continue
                    seen.add(key)
                    merged.append(entry)

                setattr(doc, db_col, dumps_or_fallback(merged, []))
            else:
                setattr(doc, db_col, dumps_or_fallback(data[js_key], [] if js_key != 'divisionReceipts' else {}))

    # Update extra_data
    known_keys = set(simple_fields.keys()) | set(json_fields.keys()) | {'id', 'createdBy', 'createdAt', 'updatedAt'}
    extra_data_dict = json.loads(doc.extra_data) if doc.extra_data else {}
    for k, v in data.items():
        if k not in known_keys:
            extra_data_dict[k] = v
    doc.extra_data = json.dumps(extra_data_dict)

    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        logger.exception('Document update IntegrityError', extra={
            'doc_id': doc_id,
            'payload_keys': sorted(list(data.keys())),
        })
        error_text = str(getattr(exc, 'orig', exc)).lower()
        if 'tracking_number' in error_text and 'unique' in error_text:
            return jsonify({'error': 'Control/Reference number already exists. Generate a new number and retry.'}), 409
        return jsonify({'error': 'Document update failed due to a data integrity constraint.'}), 400
    except SQLAlchemyError as exc:
        db.session.rollback()
        logger.exception('Document update SQLAlchemyError', extra={
            'doc_id': doc_id,
            'payload_keys': sorted(list(data.keys())),
            'db_error': str(getattr(exc, 'orig', exc)),
        })
        return jsonify({'error': 'Database error while updating document.'}), 500

    publish_event('documents-updated', {
        'docId': doc.id,
        'trackingNumber': doc.tracking_number,
        'action': 'updated',
    })

    return jsonify({'document': doc.to_dict()})


@documents_bp.route('/<int:doc_id>/completion-proof', methods=['POST'])
@jwt_required()
def save_completion_proof(doc_id):
    import base64

    user = get_authenticated_user()
    if not user:
        return jsonify({'error': 'Invalid user identity in token'}), 401

    doc = Document.query.get(doc_id)
    if not doc:
        return jsonify({'error': 'Document not found'}), 404

    if not can_user_access_document(doc, user):
        return jsonify({'error': 'Access denied for this document'}), 403

    user_division = normalize_string(user.division)
    main_division = get_document_main_division(doc)
    if not user_division or not main_division or user_division.lower() != main_division.lower():
        return jsonify({'error': 'Only the main division can upload completion proof'}), 403

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'Invalid JSON payload'}), 400

    data_url = data.get('dataUrl')
    original_name = normalize_string(data.get('name'))
    if not data_url or ',' not in str(data_url):
        return jsonify({'error': 'Missing or invalid completion proof payload'}), 400

    header, encoded = str(data_url).split(',', 1)
    if 'base64' not in header.lower():
        return jsonify({'error': 'Completion proof must be base64 encoded'}), 400

    try:
        file_data = base64.b64decode(encoded)
    except Exception:
        return jsonify({'error': 'Failed to decode completion proof file'}), 400

    if not file_data:
        return jsonify({'error': 'Completion proof file is empty'}), 400

    if len(file_data) > MAX_COMPLETION_PROOF_BYTES:
        return jsonify({'error': 'Completion proof file is too large (max 25MB)'}), 400

    storage_candidates = get_storage_root_candidates(data.get('storageFolder'))
    tracking_number = normalize_string(doc.tracking_number)
    if not tracking_number:
        return jsonify({'error': 'Document tracking number is missing'}), 500

    safe_original = sanitize_filename(original_name)
    _base_name, extension = os.path.splitext(safe_original)
    extension = extension.lower() if extension else infer_extension_from_data_url(header)
    if not extension:
        extension = '.bin'

    timestamp = datetime.utcnow().strftime('%Y%m%d-%H%M%S')
    unique_suffix = uuid.uuid4().hex[:8]
    saved_name = f'completion-proof-{timestamp}-{unique_suffix}{extension}'
    write_errors = []

    for candidate in storage_candidates:
        storage_root = candidate['storage_root']
        storage_folder = candidate['storage_folder']
        base_root = candidate['base_root']
        fallback_used = candidate['fallback_used']

        target_dir = os.path.join(storage_root, tracking_number)
        file_path = os.path.join(target_dir, saved_name)

        try:
            os.makedirs(target_dir, exist_ok=True)
            with open(file_path, 'wb') as handle:
                handle.write(file_data)
        except Exception as exc:
            if os.path.isfile(file_path):
                try:
                    os.remove(file_path)
                except OSError:
                    pass

            logger.warning(
                'Completion proof save failed on storage root %s: %s',
                base_root,
                exc,
            )
            write_errors.append(str(exc))
            continue

        publish_event('documents-updated', {
            'docId': doc.id,
            'trackingNumber': tracking_number,
            'action': 'completion-proof-uploaded',
        })

        return jsonify({
            'message': 'Completion proof saved successfully',
            'fileName': saved_name,
            'originalName': safe_original or original_name,
            'fileSize': len(file_data),
            'trackingNumber': tracking_number,
            'storageRoot': storage_root,
            'storageRootUsed': base_root,
            'storageFallbackUsed': fallback_used,
            'storageFolder': storage_folder,
        }), 200

    logger.error(
        'Completion proof save failed across all storage roots',
        extra={'doc_id': doc_id, 'tracking_number': tracking_number, 'error_count': len(write_errors)},
    )
    return jsonify({'error': 'Failed to save completion proof in configured storage roots'}), 500


@documents_bp.route('/<string:tracking_number>/files/upload-original', methods=['POST'])
@jwt_required()
def upload_original_document_file(tracking_number):
    user = get_authenticated_user()
    if not user:
        return jsonify({'error': 'Invalid user identity in token'}), 401

    if normalize_string(user.role) not in {'Operator', 'Admin'}:
        return jsonify({'error': 'Only Operator/Admin can save scanned files'}), 403

    # Reject obviously oversized payloads before writing to disk.
    content_length = request.content_length or 0
    if content_length > (MAX_SCAN_UPLOAD_BYTES + (2 * 1024 * 1024)):
        return jsonify({
            'error': f'Uploaded file is too large. Max allowed is {MAX_SCAN_UPLOAD_BYTES // (1024 * 1024)} MB.'
        }), 413

    upload = request.files.get('file')
    if upload is None:
        return jsonify({'error': 'No file part found in request'}), 400

    safe_original = sanitize_filename(upload.filename)
    if not safe_original:
        safe_original = 'scanned_document.pdf'

    ext = os.path.splitext(safe_original)[1].lower()
    if not ext:
        ext = infer_extension_from_data_url(upload.mimetype)

    allowed_ext = {'.pdf', '.png', '.jpg', '.jpeg', '.tif', '.tiff', '.webp', '.bmp'}
    if ext not in allowed_ext:
        return jsonify({'error': f'Unsupported file type for original upload: {ext or "unknown"}'}), 400

    target_name = f'scanned_document{ext}'
    try:
        file_data = upload.read()
    except Exception as exc:
        return jsonify({'error': f'Failed to read uploaded file: {str(exc)}'}), 400

    if not file_data:
        return jsonify({'error': 'Uploaded file is empty'}), 400

    if len(file_data) > MAX_SCAN_UPLOAD_BYTES:
        return jsonify({
            'error': f'Uploaded file is too large. Max allowed is {MAX_SCAN_UPLOAD_BYTES // (1024 * 1024)} MB.'
        }), 413

    storage_candidates = get_storage_root_candidates(request.form.get('storageFolder'))
    write_errors = []

    for candidate in storage_candidates:
        storage_root = candidate['storage_root']
        storage_folder = candidate['storage_folder']
        base_root = candidate['base_root']
        fallback_used = candidate['fallback_used']

        target_dir = os.path.join(storage_root, tracking_number)
        file_path = os.path.join(target_dir, target_name)

        try:
            os.makedirs(target_dir, exist_ok=True)
            with open(file_path, 'wb') as handle:
                handle.write(file_data)
        except Exception as exc:
            if os.path.isfile(file_path):
                try:
                    os.remove(file_path)
                except OSError:
                    pass

            logger.warning(
                'Original upload save failed on storage root %s: %s',
                base_root,
                exc,
            )
            write_errors.append(str(exc))
            continue

        return jsonify({
            'message': 'Original scanned file saved successfully',
            'directory': target_dir,
            'storageRoot': storage_root,
            'storageRootUsed': base_root,
            'storageFallbackUsed': fallback_used,
            'storageFolder': storage_folder,
            'fileName': target_name,
            'originalName': safe_original,
            'fileSize': len(file_data),
        }), 200

    logger.error(
        'Original upload failed across all storage roots',
        extra={'tracking_number': tracking_number, 'error_count': len(write_errors)},
    )
    return jsonify({'error': 'Failed to save uploaded original in configured storage roots'}), 500


@documents_bp.route('/<string:tracking_number>/files', methods=['POST'])
@jwt_required()
def save_document_files(tracking_number):
    import base64

    user = get_authenticated_user()
    if not user:
        return jsonify({'error': 'Invalid user identity in token'}), 401

    if normalize_string(user.role) not in {'Operator', 'Admin'}:
        return jsonify({'error': 'Only Operator/Admin can save scanned files'}), 403

    data = request.get_json()
    if not data or 'attachments' not in data:
        return jsonify({'error': 'No attachments provided'}), 400

    attachments = data['attachments']

    target_folder_name = build_document_folder_name(tracking_number, data.get('subject'))
    decoded_attachments = []

    for att in attachments:
        if 'dataUrl' not in att or 'name' not in att:
            continue

        data_url = str(att['dataUrl'])
        if ',' not in data_url:
            continue

        _header, encoded = data_url.split(',', 1)
        try:
            file_data = base64.b64decode(encoded)
        except Exception:
            continue

        target_name = att['name']
        if att.get('kind') == 'original':
            ext = os.path.splitext(att['name'])[1]
            if not ext:
                ext = '.pdf'
            target_name = f"scanned_document{ext}"
        elif att.get('kind') == 'stamped-image':
            target_name = f"{tracking_number}.png"
        elif att.get('kind') == 'stamped-pdf':
            target_name = f"{tracking_number}.pdf"

        decoded_attachments.append((target_name, file_data, att['name']))

    storage_candidates = get_storage_root_candidates(data.get('storageFolder'))
    write_errors = []

    for candidate in storage_candidates:
        storage_root = candidate['storage_root']
        storage_folder = candidate['storage_folder']
        base_root = candidate['base_root']
        fallback_used = candidate['fallback_used']

        target_dir = os.path.join(storage_root, target_folder_name)
        saved_files = []

        try:
            os.makedirs(target_dir, exist_ok=True)

            for target_name, file_data, _source_name in decoded_attachments:
                file_path = os.path.join(target_dir, target_name)
                with open(file_path, 'wb') as handle:
                    handle.write(file_data)
                saved_files.append(file_path)
        except Exception as exc:
            for saved_path in saved_files:
                if os.path.isfile(saved_path):
                    try:
                        os.remove(saved_path)
                    except OSError:
                        pass

            logger.warning(
                'Attachment save failed on storage root %s: %s',
                base_root,
                exc,
            )
            write_errors.append(str(exc))
            continue

        return jsonify({
            'message': 'Files saved successfully',
            'directory': target_dir,
            'documentFolder': target_folder_name,
            'storageRoot': storage_root,
            'storageRootUsed': base_root,
            'storageFallbackUsed': fallback_used,
            'storageFolder': storage_folder,
            'savedConfigs': saved_files
        }), 200

    logger.error(
        'Attachment save failed across all storage roots',
        extra={'tracking_number': tracking_number, 'error_count': len(write_errors)},
    )
    return jsonify({'error': 'Failed to save files in configured storage roots'}), 500


@documents_bp.route("/<string:tracking_number>/files/<path:filename>", methods=["GET"])
@jwt_required()
def get_document_file(tracking_number, filename):
    from flask import send_from_directory

    user = get_authenticated_user()
    if not user:
        return jsonify({'error': 'Invalid user identity in token'}), 401

    doc = Document.query.filter_by(tracking_number=tracking_number).first()
    if doc and not can_user_access_document(doc, user):
        return jsonify({'error': 'Access denied for this document file'}), 403

    if not doc and normalize_string(user.role) == 'Division':
        return jsonify({'error': 'Access denied for this document file'}), 403

    candidate_dirs = []
    for candidate in get_storage_root_candidates(request.args.get('storageFolder')):
        candidate_dirs.append(os.path.join(candidate['storage_root'], tracking_number))

    # Backward compatibility for files saved before dedicated-folder support.
    candidate_dirs.append(os.path.join(LEGACY_STORAGE_ROOT, tracking_number))

    seen_dirs = set()
    found_dir = False

    for target_dir in candidate_dirs:
        normalized_dir = os.path.normcase(os.path.normpath(target_dir))
        if normalized_dir in seen_dirs:
            continue
        seen_dirs.add(normalized_dir)

        if not os.path.isdir(target_dir):
            continue

        found_dir = True
        file_path = os.path.join(target_dir, filename)

        # Ensure filename is safe to prevent directory traversal attacks.
        if not os.path.commonprefix([os.path.realpath(file_path), os.path.realpath(target_dir)]) == os.path.realpath(target_dir):
            return jsonify({"error": "Attempted directory traversal"}), 400

        if os.path.isfile(file_path):
            return send_from_directory(target_dir, filename, as_attachment=False)

    if not found_dir:
        return jsonify({"error": "Document directory not found"}), 404

    return jsonify({"error": "File not found"}), 404


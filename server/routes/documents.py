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

documents_bp = Blueprint('documents', __name__)
logger = logging.getLogger(__name__)

DEFAULT_STORAGE_FOLDER = os.environ.get('DOCTRACK_STORAGE_FOLDER', 'DocTrack Files')
LEGACY_STORAGE_ROOT = 'D:\\'


def sanitize_storage_folder(folder_name):
    raw = (folder_name or '').strip()
    if not raw:
        raw = DEFAULT_STORAGE_FOLDER

    # Allow only safe folder-name characters to avoid path traversal.
    safe = ''.join(ch for ch in raw if ch.isalnum() or ch in (' ', '-', '_')).strip().rstrip('.')
    return safe or DEFAULT_STORAGE_FOLDER


def get_storage_root(folder_name=None):
    resolved_folder = sanitize_storage_folder(folder_name)
    return os.path.join(LEGACY_STORAGE_ROOT, resolved_folder), resolved_folder


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


@documents_bp.route('', methods=['GET'])
@jwt_required()
def list_documents():
    docs = Document.query.order_by(Document.created_at.desc()).all()
    return jsonify({'documents': [d.to_dict() for d in docs]})


@documents_bp.route('/<int:doc_id>', methods=['GET'])
@jwt_required()
def get_document(doc_id):
    doc = Document.query.get(doc_id)
    if not doc:
        return jsonify({'error': 'Document not found'}), 404
    return jsonify({'document': doc.to_dict()})


@documents_bp.route('', methods=['POST'])
@jwt_required()
def create_document():
    try:
        user_id = int(get_jwt_identity())
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid user identity in token'}), 401

    user = db.session.get(User, user_id)
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
        created_by=user_id,
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
            return jsonify({'error': 'Control/Tracking number already exists. Generate a new number and retry.'}), 409
        return jsonify({'error': 'Document save failed due to a data integrity constraint.'}), 400
    except SQLAlchemyError as exc:
        db.session.rollback()
        logger.exception('Document create SQLAlchemyError', extra={
            'tracking_number': tracking_number,
            'payload_keys': sorted(list(data.keys())),
            'db_error': str(getattr(exc, 'orig', exc)),
        })
        return jsonify({'error': 'Database error while saving document.'}), 500

    return jsonify({'document': doc.to_dict(), 'controlNumber': doc.tracking_number}), 201


@documents_bp.route('/<int:doc_id>', methods=['PUT'])
@jwt_required()
def update_document(doc_id):
    doc = Document.query.get(doc_id)
    if not doc:
        return jsonify({'error': 'Document not found'}), 404

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
            return jsonify({'error': 'Control/Tracking number already exists. Generate a new number and retry.'}), 409
        return jsonify({'error': 'Document update failed due to a data integrity constraint.'}), 400
    except SQLAlchemyError as exc:
        db.session.rollback()
        logger.exception('Document update SQLAlchemyError', extra={
            'doc_id': doc_id,
            'payload_keys': sorted(list(data.keys())),
            'db_error': str(getattr(exc, 'orig', exc)),
        })
        return jsonify({'error': 'Database error while updating document.'}), 500

    return jsonify({'document': doc.to_dict()})


@documents_bp.route('/<string:tracking_number>/files', methods=['POST'])
@jwt_required()
def save_document_files(tracking_number):
    import base64

    data = request.get_json()
    if not data or 'attachments' not in data:
        return jsonify({'error': 'No attachments provided'}), 400

    attachments = data['attachments']

    storage_root, storage_folder = get_storage_root(data.get('storageFolder'))

    # Create dedicated folder per control/tracking number.
    target_dir = os.path.join(storage_root, tracking_number)
    
    try:
        os.makedirs(target_dir, exist_ok=True)
    except Exception as e:
        return jsonify({'error': f'Failed to create directory {target_dir}: {str(e)}'}), 500

    saved_files = []

    for att in attachments:
        if 'dataUrl' not in att or 'name' not in att:
            continue

        data_url = att['dataUrl']

        # Parse the base64 data URL
        # Format: data:image/png;base64,iVBORw0KGgo...
        if ',' in data_url:
            header, encoded = data_url.split(',', 1)
            try:
                # Decode the base64 string
                file_data = base64.b64decode(encoded)
                
                # Determine correct target name
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

                file_path = os.path.join(target_dir, target_name)

                with open(file_path, 'wb') as f:
                    f.write(file_data)

                saved_files.append(file_path)
            except Exception as e:
                print(f"Error saving {att['name']}: {str(e)}")
                continue

    return jsonify({
        'message': 'Files saved successfully',
        'directory': target_dir,
        'storageRoot': storage_root,
        'storageFolder': storage_folder,
        'savedConfigs': saved_files
    }), 200


@documents_bp.route("/<string:tracking_number>/files/<path:filename>", methods=["GET"])
@jwt_required()
def get_document_file(tracking_number, filename):
    from flask import send_from_directory

    storage_root, _storage_folder = get_storage_root(request.args.get('storageFolder'))
    target_dir = os.path.join(storage_root, tracking_number)

    # Backward compatibility for files saved before dedicated-folder support.
    if not os.path.isdir(target_dir):
        legacy_dir = os.path.join(LEGACY_STORAGE_ROOT, tracking_number)
        if os.path.isdir(legacy_dir):
            target_dir = legacy_dir

    if not os.path.isdir(target_dir):
        return jsonify({"error": "Document directory not found"}), 404

    file_path = os.path.join(target_dir, filename)
    if not os.path.isfile(file_path):
        return jsonify({"error": "File not found"}), 404
    
    # Ensure filename is safe to prevent directory traversal attacks
    if not os.path.commonprefix([os.path.realpath(file_path), os.path.realpath(target_dir)]) == os.path.realpath(target_dir):
        return jsonify({"error": "Attempted directory traversal"}), 400

    return send_from_directory(target_dir, filename, as_attachment=False)


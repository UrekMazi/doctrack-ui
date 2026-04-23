"""User management routes — Admin only"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
import bcrypt
from models import db, User
from position_catalog import get_catalog_for_api, dedupe_positions

users_bp = Blueprint('users', __name__)


def require_admin():
    """Check if current user is Admin. Returns user or (error_response, status)."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role != 'Admin':
        return None
    return user


@users_bp.route('', methods=['GET'])
@jwt_required()
def list_users():
    admin = require_admin()
    if not admin:
        return jsonify({'error': 'Admin access required'}), 403
    users = User.query.order_by(User.id).all()
    return jsonify({'users': [u.to_dict() for u in users]})


@users_bp.route('', methods=['POST'])
@jwt_required()
def create_user():
    admin = require_admin()
    if not admin:
        return jsonify({'error': 'Admin access required'}), 403

    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    full_name = data.get('fullName', '').strip()
    role = data.get('role', '').strip()
    division = data.get('division', '').strip() or None
    position = data.get('position', '').strip() or None

    if not username or not password or not full_name or not role:
        return jsonify({'error': 'Username, password, full name, and role are required'}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'error': f'Username "{username}" already exists'}), 409

    pw_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user = User(
        username=username,
        password_hash=pw_hash,
        full_name=full_name,
        role=role,
        division=division,
        position=position,
    )
    db.session.add(user)
    db.session.commit()
    return jsonify({'user': user.to_dict()}), 201


@users_bp.route('/division-positions', methods=['GET'])
@jwt_required()
def list_division_positions():
    include_active = str(request.args.get('includeActive', 'false')).strip().lower() in {'1', 'true', 'yes'}
    include_inactive = str(request.args.get('includeInactive', 'false')).strip().lower() in {'1', 'true', 'yes'}
    include_all = str(request.args.get('includeAll', 'false')).strip().lower() in {'1', 'true', 'yes'}

    if include_all:
        include_active = True
        include_inactive = True

    division_positions = {
        division: sorted(dedupe_positions(list(positions)), key=lambda value: value.lower())
        for division, positions in sorted(get_catalog_for_api().items(), key=lambda entry: entry[0].lower())
    }

    if not include_active and not include_inactive:
        return jsonify({'divisionPositions': division_positions})

    if include_active and include_inactive:
        users = User.query.all()
    elif include_active:
        users = User.query.filter_by(is_active=True).all()
    else:
        users = User.query.filter_by(is_active=False).all()

    merged = {
        division: set(positions)
        for division, positions in division_positions.items()
    }

    for user in users:
        division = (user.division or '').strip()
        position = (user.position or '').strip()
        if not division or not position:
            continue

        if division not in merged:
            merged[division] = set()
        merged[division].add(position)

    ordered = {
        division: sorted(dedupe_positions(list(positions)), key=lambda value: value.lower())
        for division, positions in sorted(merged.items(), key=lambda entry: entry[0].lower())
    }
    return jsonify({'divisionPositions': ordered})


@users_bp.route('/<int:user_id>', methods=['PUT'])
@jwt_required()
def update_user(user_id):
    admin = require_admin()
    if not admin:
        return jsonify({'error': 'Admin access required'}), 403

    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json()
    if 'fullName' in data:
        user.full_name = data['fullName'].strip()
    if 'role' in data:
        user.role = data['role'].strip()
    if 'division' in data:
        user.division = data['division'].strip() or None
    if 'position' in data:
        user.position = data['position'].strip() or None
    if 'isActive' in data:
        user.is_active = bool(data['isActive'])
    if 'password' in data and data['password'].strip():
        pw_hash = bcrypt.hashpw(data['password'].strip().encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        user.password_hash = pw_hash

    db.session.commit()
    return jsonify({'user': user.to_dict()})


@users_bp.route('/<int:user_id>', methods=['DELETE'])
@jwt_required()
def delete_user(user_id):
    admin = require_admin()
    if not admin:
        return jsonify({'error': 'Admin access required'}), 403

    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    # Soft-delete: deactivate instead of removing
    user.is_active = False
    db.session.commit()
    return jsonify({'message': f'User {user.username} deactivated'})

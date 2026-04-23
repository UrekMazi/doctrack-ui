"""Auth routes — login, logout, current user"""
import os

from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
import bcrypt
from models import User

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400

    user = User.query.filter_by(username=username, is_active=True).first()
    if not user:
        return jsonify({'error': 'Invalid username or password'}), 401

    if not bcrypt.checkpw(password.encode('utf-8'), user.password_hash.encode('utf-8')):
        return jsonify({'error': 'Invalid username or password'}), 401

    token = create_access_token(identity=str(user.id))
    return jsonify({
        'token': token,
        'user': user.to_dict(),
    })


@auth_bp.route('/lan-cert', methods=['GET'])
def download_lan_certificate():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    cert_path = os.path.join(repo_root, '.cert', 'doctrack-lan.cer')

    if not os.path.isfile(cert_path):
        return jsonify({'error': 'LAN certificate not found. Run ops\\setup-lan-https.ps1 first.'}), 404

    return send_file(
        cert_path,
        as_attachment=True,
        download_name='doctrack-lan.cer',
        mimetype='application/pkix-cert',
    )


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or not user.is_active:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'user': user.to_dict()})

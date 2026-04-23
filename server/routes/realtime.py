"""Realtime routes using Server-Sent Events (SSE)."""

from __future__ import annotations

import json
from queue import Empty

from flask import Blueprint, Response, jsonify, request, stream_with_context
from flask_jwt_extended import decode_token

from models import User, db
from realtime_events import subscribe, unsubscribe

realtime_bp = Blueprint('realtime', __name__)


def build_sse_message(event_name, payload):
    return f"event: {event_name}\ndata: {json.dumps(payload)}\n\n"


def get_request_token():
    authorization = str(request.headers.get('Authorization') or '').strip()
    if authorization.lower().startswith('bearer '):
        return authorization[7:].strip()
    return str(request.args.get('token') or '').strip()


def get_authenticated_user_from_request():
    raw_token = get_request_token()
    if not raw_token:
        return None, ('Missing auth token', 401)

    try:
        decoded = decode_token(raw_token)
        identity = int(decoded.get('sub'))
    except Exception:
        return None, ('Invalid auth token', 401)

    user = db.session.get(User, identity)
    if not user or not user.is_active:
        return None, ('User not found', 401)

    return user, None


@realtime_bp.route('/stream', methods=['GET'])
def stream_realtime_events():
    user, auth_error = get_authenticated_user_from_request()
    if auth_error:
        message, status_code = auth_error
        return jsonify({'error': message}), status_code

    subscriber_id, queue = subscribe()

    @stream_with_context
    def event_stream():
        try:
            connected_payload = {
                'type': 'connected',
                'payload': {
                    'userId': user.id,
                    'role': user.role,
                },
            }
            yield build_sse_message('connected', connected_payload)

            while True:
                try:
                    event = queue.get(timeout=25)
                    event_name = str(event.get('type') or 'message')
                    yield build_sse_message(event_name, event)
                except Empty:
                    yield ': keep-alive\n\n'
        except GeneratorExit:
            pass
        finally:
            unsubscribe(subscriber_id)

    response = Response(event_stream(), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['Connection'] = 'keep-alive'
    response.headers['X-Accel-Buffering'] = 'no'
    return response

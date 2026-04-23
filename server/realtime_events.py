"""In-memory realtime event fanout for active SSE clients."""

from __future__ import annotations

import time
import uuid
from queue import Empty, Full, Queue
from threading import Lock

MAX_QUEUE_SIZE = 100

_SUBSCRIBERS = {}
_SUBSCRIBERS_LOCK = Lock()


def subscribe():
    subscriber_id = uuid.uuid4().hex
    queue = Queue(maxsize=MAX_QUEUE_SIZE)

    with _SUBSCRIBERS_LOCK:
        _SUBSCRIBERS[subscriber_id] = queue

    return subscriber_id, queue


def unsubscribe(subscriber_id):
    with _SUBSCRIBERS_LOCK:
        _SUBSCRIBERS.pop(subscriber_id, None)


def publish_event(event_type, payload=None):
    event = {
        'type': str(event_type or 'message'),
        'timestamp': int(time.time() * 1000),
        'payload': payload or {},
    }

    with _SUBSCRIBERS_LOCK:
        subscribers = list(_SUBSCRIBERS.items())

    for _subscriber_id, queue in subscribers:
        try:
            queue.put_nowait(event)
        except Full:
            try:
                queue.get_nowait()
            except Empty:
                pass

            try:
                queue.put_nowait(event)
            except Full:
                continue

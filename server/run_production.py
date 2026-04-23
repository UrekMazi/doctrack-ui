"""Run DocTrack backend in production mode (no Flask debug reloader)."""

import os

from app import create_app


if __name__ == '__main__':
    app = create_app()
    backend_host = os.environ.get('DOCTRACK_BACKEND_HOST', '127.0.0.1').strip() or '127.0.0.1'
    backend_port = int(os.environ.get('DOCTRACK_BACKEND_PORT', '3001'))
    print(f'DocTrack Backend (production) starting on http://{backend_host}:{backend_port}')
    app.run(host=backend_host, port=backend_port, debug=False)

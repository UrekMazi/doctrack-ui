"""
DocTrack EDMS — Flask Application Factory
"""
import os
from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from sqlalchemy import text
from models import db


def ensure_documents_schema():
    """Apply lightweight SQLite-safe schema fixes for existing deployments."""
    table_exists = db.session.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'")
    ).first()
    if not table_exists:
        return

    rows = db.session.execute(text('PRAGMA table_info(documents)')).fetchall()
    existing_columns = {row[1] for row in rows}

    # Older DB snapshots may not have this dynamic payload column.
    if 'extra_data' not in existing_columns:
        db.session.execute(text("ALTER TABLE documents ADD COLUMN extra_data TEXT DEFAULT '{}'"))

    db.session.execute(text("UPDATE documents SET extra_data='{}' WHERE extra_data IS NULL"))
    db.session.commit()


def create_app():
    app = Flask(__name__)

    # Configuration
    base_dir = os.path.abspath(os.path.dirname(__file__))
    app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{os.path.join(base_dir, 'doctrack.db')}"
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET', 'ppa-doctrack-dev-secret-2026')
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = 86400  # 24 hours

    # Extensions
    db.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    JWTManager(app)

    # Create tables
    with app.app_context():
        db.create_all()
        ensure_documents_schema()

    # Register blueprints
    from routes.auth import auth_bp
    from routes.users import users_bp
    from routes.documents import documents_bp
    from routes.ocr import ocr_bp
    from routes.reports import reports_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(users_bp, url_prefix='/api/users')
    app.register_blueprint(documents_bp, url_prefix='/api/documents')
    app.register_blueprint(ocr_bp, url_prefix='/api/ocr')
    app.register_blueprint(reports_bp, url_prefix='/api/reports')

    return app


if __name__ == '__main__':
    app = create_app()
    print("DocTrack Backend starting on http://localhost:3001")
    app.run(host='0.0.0.0', port=3001, debug=True)

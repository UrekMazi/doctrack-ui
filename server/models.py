"""
DocTrack EDMS — Flask Backend
Database models and initialization using Flask-SQLAlchemy + SQLite
"""
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    full_name = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(50), nullable=False)  # Operator, OPM Assistant, PM, Division, Admin
    division = db.Column(db.String(100))
    position = db.Column(db.String(100))
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'fullName': self.full_name,
            'role': self.role,
            'division': self.division,
            'position': self.position,
            'isActive': self.is_active,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
        }


class Document(db.Model):
    __tablename__ = 'documents'
    id = db.Column(db.Integer, primary_key=True)
    tracking_number = db.Column(db.String(20), unique=True, nullable=False)
    date_received = db.Column(db.String(20))
    time_received = db.Column(db.String(20))
    subject = db.Column(db.Text)
    sender = db.Column(db.String(300))
    sender_address = db.Column(db.String(300))
    type = db.Column(db.String(50))
    status = db.Column(db.String(50), default='Registered')
    action = db.Column(db.String(50))
    due_date = db.Column(db.String(20))
    date_of_comm = db.Column(db.String(20))
    remarks = db.Column(db.Text)
    target_division = db.Column(db.String(100))
    target_divisions = db.Column(db.Text)  # JSON string
    main_division = db.Column(db.String(20))
    instruction_comments = db.Column(db.Text)  # JSON string
    routing_history = db.Column(db.Text)  # JSON string
    division_receipts_json = db.Column(db.Text)  # JSON string
    extra_data = db.Column(db.Text, default='{}')  # JSON string for any other dynamic fields
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        import json

        def safe_json(raw_value, fallback):
            try:
                if not raw_value:
                    return fallback
                parsed = json.loads(raw_value)
                return parsed
            except Exception:
                return fallback
        
        # Parse extra_data
        extra_parsed = safe_json(self.extra_data, {})
            
        base_dict = {
            'id': self.id,
            'trackingNumber': self.tracking_number,
            'dateReceived': self.date_received,
            'timeReceived': self.time_received,
            'subject': self.subject,
            'sender': self.sender,
            'senderAddress': self.sender_address,
            'type': self.type,
            'status': self.status,
            'action': self.action,
            'dueDate': self.due_date,
            'dateOfComm': self.date_of_comm,
            'remarks': self.remarks,
            'targetDivision': self.target_division,
            'targetDivisions': safe_json(self.target_divisions, []),
            'mainDivision': self.main_division,
            'instructionComments': safe_json(self.instruction_comments, []),
            'routingHistory': safe_json(self.routing_history, []),
            'divisionReceipts': safe_json(self.division_receipts_json, {}),
            'createdBy': self.created_by,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
        }
        
        # Merge extra data into the root object (won't overwrite explicit keys)
        for k, v in extra_parsed.items():
            if k not in base_dict:
                base_dict[k] = v
                
        return base_dict

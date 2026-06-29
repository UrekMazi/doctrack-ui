from app import create_app
from models import db, Document
from routes.auth import create_access_token
import json
import time

app = create_app()

def run_test():
    with app.test_client() as client:
        with app.app_context():
            token = create_access_token(identity={'id': 1, 'username': 'admin', 'role': 'Admin'})
            headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
            
            # 2. Get document 18
            res = client.get('/api/documents', headers=headers)
            docs = res.get_json()['documents']
            doc18 = next((d for d in docs if d['id'] == 18), None)
            if not doc18:
                print("Doc 18 not found")
                return
                
            replies = doc18.get('replyComments', [])
            print(f"Before PUT: {len(replies)} replies")
            
            # 3. Add a new reply
            new_reply = {
                "id": f"RPL-{int(time.time()*1000)}",
                "roleLabel": "Admin",
                "name": "Test Script",
                "comment": "hello from script",
                "createdAt": "2026-06-24T00:00:00.000Z"
            }
            new_replies = replies + [new_reply]
            
            # 4. PUT request
            res = client.put('/api/documents/18', json={"replyComments": new_replies}, headers=headers)
            put_response = res.get_json()['document']
            
            put_replies = put_response.get('replyComments', [])
            print(f"After PUT response: {len(put_replies)} replies")
            print(f"Last reply in PUT response: {put_replies[-1] if put_replies else None}")
            
            # 5. GET request again to check
            res = client.get('/api/documents', headers=headers)
            docs = res.get_json()['documents']
            doc18 = next((d for d in docs if d['id'] == 18), None)
            get_replies = doc18.get('replyComments', [])
            print(f"After GET response: {len(get_replies)} replies")
            print(f"Last reply in GET response: {get_replies[-1] if get_replies else None}")

run_test()

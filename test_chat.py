import time
import requests

def test_chat():
    # Login as Admin
    res = requests.post('http://127.0.0.1:5000/api/auth/login', json={'username': 'admin', 'password': 'password'})
    admin_token = res.json()['token']

    # Login as Records
    res = requests.post('http://127.0.0.1:5000/api/auth/login', json={'username': 'records', 'password': 'password'})
    records_token = res.json()['token']

    # Admin sends message
    print("Admin sending message...")
    res = requests.put('http://127.0.0.1:5000/api/documents/18', 
                       json={'replyComments': [{'id': 'test-1', 'comment': 'Admin Msg', 'roleLabel': 'Admin', 'name': 'Admin'}]},
                       headers={'Authorization': f'Bearer {admin_token}'})
    print("Admin PUT status:", res.status_code)

    # Records fetches document
    print("Records fetching document...")
    res = requests.get('http://127.0.0.1:5000/api/documents', headers={'Authorization': f'Bearer {records_token}'})
    docs = res.json().get('documents', [])
    doc18 = next((d for d in docs if d['id'] == 18), None)
    print("Records sees replies:", [r.get('comment') for r in doc18.get('replyComments', [])])

test_chat()

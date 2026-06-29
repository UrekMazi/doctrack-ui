from app import create_app
from routes.auth import create_access_token

app = create_app()
with app.test_client() as client:
    with app.app_context():
        token = create_access_token(identity={'id': 1, 'username': 'admin', 'role': 'Admin'})
        headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
        res = client.get('/api/documents', headers=headers)
        print(res.status_code)
        print(res.get_data(as_text=True))

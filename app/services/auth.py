import os
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Resolve credentials.json path relative to the project root
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CREDS_PATH = os.path.join(BASE_DIR, "credentials.json")

def fetch_google_docs():
    SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
    if not os.path.exists(CREDS_PATH):
        raise FileNotFoundError(f"Google credentials not found at {CREDS_PATH}")
        
    flow = InstalledAppFlow.from_client_secrets_file(CREDS_PATH, SCOPES)
    # Use an ephemeral free port to avoid conflicts
    creds = flow.run_local_server(port=0)

    service = build('drive', 'v3', credentials=creds)
    results = service.files().list(
        q="mimeType='application/vnd.google-apps.document'",
        pageSize=10, fields="files(id, name)").execute()
    items = results.get('files', [])
    return items

def extract_doc_text(doc_id):
    SCOPES = ['https://www.googleapis.com/auth/documents.readonly']
    flow = InstalledAppFlow.from_client_secrets_file(CREDS_PATH, SCOPES)
    # Different ephemeral port for the Docs flow (also auto-selected)
    creds = flow.run_local_server(port=0)

    service = build('docs', 'v1', credentials=creds)
    document = service.documents().get(documentId=doc_id).execute()

    text = ""
    for content in document.get('body').get('content', []):
        paragraph = content.get('paragraph')
        if not paragraph:
            continue
        for elem in paragraph.get('elements', []):
            if 'textRun' in elem:
                text += elem['textRun']['content']
    return text

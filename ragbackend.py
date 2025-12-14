import os
import time
import uuid
from flask import Flask, render_template, request, jsonify, session, Response, stream_with_context
from werkzeug.utils import secure_filename
from google_auth import fetch_google_docs, extract_doc_text
from rag_pipeline import setup_vector_store, generate_answer, generate_answer_general
import PyPDF2
import pdfplumber
import docx
from openai import RateLimitError

# Configure Flask to look for templates/static in parent directory
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app = Flask(
    __name__,
    template_folder=os.path.join(parent_dir, 'templates'),
    static_folder=os.path.join(parent_dir, 'static'),
)

# Basic secret key for signing session cookies (replace with env var in production)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-secret-key-change-me")

# Upload configuration
UPLOAD_FOLDER = os.path.join(parent_dir, 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Cache to hold docs content
knowledge_base = None

# In-memory chat history per session_id: { session_id: [ {"role": "user"|"assistant", "content": str}, ... ] }
conversations = {}

# Serve frontend
@app.route("/")
def index():
    """Serve the main frontend page."""
    return render_template("index.html")

# Simple health/status endpoint for monitoring
@app.route("/health")
def health():
    """Return basic system health information for the frontend UI.

    This does lightweight checks only (no external API calls):
    - vector_store_loaded: whether the in-memory FAISS store is initialised
    - gemini_configured: GEMINI_API_KEY present
    - openai_configured: OPENAI_API_KEY present
    - google_credentials_present: credentials.json file exists
    """
    global knowledge_base

    gemini_key = os.getenv("GEMINI_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    creds_path = os.path.join(parent_dir, "credentials.json")

    return jsonify({
        "status": "ok",
        "vector_store_loaded": knowledge_base is not None,
        "gemini_configured": bool(gemini_key),
        "openai_configured": bool(openai_key),
        "google_credentials_present": os.path.exists(creds_path),
    })

@app.route('/fetch_docs')
def fetch_docs():
    docs = fetch_google_docs()
    return jsonify(docs)

@app.route('/load_docs', methods=['POST'])
def load_docs():
    """Handle both file uploads and Google Docs IDs."""
    global knowledge_base
    
    contents = []
    
    # Check if this is a file upload request
    if 'files' in request.files:
        files = request.files.getlist('files')
        
        if not files or files[0].filename == '':
            return jsonify({"error": "No files selected"}), 400
        
        for file in files:
            if file.filename == '':
                continue
                
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            
            # Extract text based on file type
            try:
                text = extract_text_from_file(filepath)
                if text:
                    contents.append(text)
            except Exception as e:
                print(f"Error extracting text from {filename}: {e}")
                continue
        
        message = f"{len(contents)} file(s) processed and added to knowledge base"
    
    # Check if this is a Google Docs request
    elif request.is_json and 'doc_ids' in request.json:
        doc_ids = request.json.get("doc_ids", [])
        contents = [extract_doc_text(doc_id) for doc_id in doc_ids]
        message = f"{len(doc_ids)} Google Doc(s) added to knowledge base"
    
    else:
        return jsonify({"error": "Invalid request format"}), 400
    
    if not contents:
        return jsonify({"error": "No content extracted from files"}), 400
    
    # Build vector store with error handling so the frontend gets a clear message
    try:
        knowledge_base = setup_vector_store(contents)
    except RateLimitError as e:
        # Most common cause: OpenAI quota/billing issue for the configured API key
        return jsonify({
            "error": "OpenAI quota exceeded or rate limit hit. Please check your OpenAI plan, billing, and API key.",
            "details": str(e)
        }), 429
    except Exception as e:
        # Generic failure building the vector store
        print(f"Error building vector store: {e}")
        return jsonify({
            "error": "Failed to build knowledge base from uploaded documents.",
            "details": str(e)
        }), 500
    
    return jsonify({"message": message})

def _get_session_id():
    """Get or create a session identifier stored in the signed cookie."""
    sid = session.get("session_id")
    if not sid:
        sid = str(uuid.uuid4())
        session["session_id"] = sid
    return sid


@app.route('/ask', methods=['POST'])
def ask():
    """Non-streaming answer endpoint (supports RAG and general modes)."""
    global knowledge_base, conversations

    data = request.get_json(silent=True) or {}
    user_query = data.get('query', '')
    mode = data.get('mode', 'rag')  # 'rag' or 'chatgpt'
    if not user_query:
        return jsonify({"answer": "No query provided."}), 400

    # Get / create chat history for this browser session
    session_id = _get_session_id()
    history = conversations.setdefault(session_id, [])

    # Generate answer based on mode
    if mode == 'chatgpt':
        result = generate_answer_general(user_query, history)
    else:
        if not knowledge_base:
            return jsonify({"answer": "No documents loaded yet."})
        result = generate_answer(user_query, knowledge_base, history)
    answer = result.get("answer", "")
    sources = result.get("sources", [])

    # Append to history (simple list of turns)
    history.append({"role": "user", "content": user_query})
    history.append({"role": "assistant", "content": answer})

    return jsonify({"answer": answer, "sources": sources})


@app.route('/ask_stream', methods=['POST'])
def ask_stream():
    """Streaming answer endpoint using the same RAG + memory logic.

    For now we generate the full answer once and stream it out in small
    chunks so the frontend can show a "typing" effect.
    """
    global knowledge_base, conversations

    data = request.get_json(silent=True) or {}
    user_query = data.get('query', '')
    mode = data.get('mode', 'rag')  # 'rag' or 'chatgpt'
    if not user_query:
        return Response("No query provided.", mimetype="text/plain", status=400)

    # Get / create chat history for this browser session
    session_id = _get_session_id()
    history = conversations.setdefault(session_id, [])

    # Generate full answer based on mode (same logic as /ask)
    if mode == 'chatgpt':
        result = generate_answer_general(user_query, history)
    else:
        if not knowledge_base:
            return Response("No documents loaded yet.", mimetype="text/plain")
        result = generate_answer(user_query, knowledge_base, history)

    full_answer = result.get("answer", "")

    # Persist to history
    history.append({"role": "user", "content": user_query})
    history.append({"role": "assistant", "content": full_answer})

    @stream_with_context
    def generate_chunks():
        chunk_size = 64
        for i in range(0, len(full_answer), chunk_size):
            yield full_answer[i:i+chunk_size]
            # Tiny sleep to smooth out UI rendering; adjust as desired
            time.sleep(0.02)

    return Response(generate_chunks(), mimetype="text/plain")


@app.route('/clear_chat', methods=['POST'])
def clear_chat():
    """Clear conversation history for the current browser session."""
    global conversations
    session_id = _get_session_id()
    if session_id in conversations:
        del conversations[session_id]
    return jsonify({"status": "cleared"})


def extract_text_from_file(filepath):
    """Extract text from TXT, PDF, or DOCX files."""
    ext = os.path.splitext(filepath)[1].lower()
    
    if ext == '.txt':
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
    
    elif ext == '.pdf':
        # Use pdfplumber to extract both text and tables
        text_chunks = []
        with pdfplumber.open(filepath) as pdf:
            for page in pdf.pages:
                # Page text
                page_text = page.extract_text() or ""
                if page_text:
                    text_chunks.append(page_text)

                # Tables -> convert each row to a pipe-separated line
                tables = page.extract_tables() or []
                for table in tables:
                    for row in table:
                        if not row:
                            continue
                        row_text = " | ".join(cell.strip() if isinstance(cell, str) else "" for cell in row)
                        if row_text.strip():
                            text_chunks.append(row_text)
        return "\n".join(text_chunks)
    
    elif ext == '.docx':
        doc = docx.Document(filepath)
        text = "\n".join([para.text for para in doc.paragraphs])
        return text
    
    else:
        return None

if __name__ == "__main__":
    print(f"Templates folder: {app.template_folder}")
    print(f"Static folder: {app.static_folder}")
    print(f"Upload folder: {app.config['UPLOAD_FOLDER']}")
    print("\nStarting Flask server on http://localhost:8000")
    print("Press CTRL+C to quit\n")
    app.run(host="127.0.0.1", port=8000, debug=True)

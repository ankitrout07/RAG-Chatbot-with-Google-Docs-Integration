import os
import time
import uuid
from flask import render_template, request, jsonify, session, Response, stream_with_context, current_app as app
from werkzeug.utils import secure_filename
from openai import RateLimitError

from .services.auth import fetch_google_docs, extract_doc_text
from .services.pipeline import setup_vector_store, generate_answer, generate_answer_general
from .services.document_service import extract_text_from_file

import numpy as np
from numpy.linalg import norm
from langchain_google_genai import GoogleGenerativeAIEmbeddings

# Global cache for the vector store, chat histories, and semantic cache
knowledge_base = None
conversations = {}
semantic_cache = []

def cosine_similarity(v1, v2):
    return np.dot(v1, v2) / (norm(v1) * norm(v2))

def get_embeddings_model(api_keys=None):
    gemini_key = (api_keys and api_keys.get("gemini")) or os.getenv("GEMINI_API_KEY")
    return GoogleGenerativeAIEmbeddings(model="models/text-embedding-004", google_api_key=gemini_key)

def _get_session_id():
    """Get or create a session identifier stored in the signed cookie."""
    sid = session.get("session_id")
    if not sid:
        sid = str(uuid.uuid4())
        session["session_id"] = sid
    return sid

@app.route("/")
def index():
    """Serve the main frontend page."""
    return render_template("index.html")

@app.route("/health")
def health():
    """Return system health information."""
    global knowledge_base
    gemini_key = os.getenv("GEMINI_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    # Base directory is one level above the current file's directory
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    creds_path = os.path.join(BASE_DIR, "credentials.json")
    
    return jsonify({
        "status": "ok",
        "vector_store_loaded": knowledge_base is not None,
        "gemini_configured": bool(gemini_key),
        "openai_configured": bool(openai_key),
        "google_credentials_present": os.path.exists(creds_path),
    })

@app.route('/fetch_docs')
def fetch_docs_route():
    try:
        docs = fetch_google_docs()
        return jsonify(docs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/load_docs', methods=['POST'])
def load_docs():
    global knowledge_base
    contents = []
    
    if 'files' in request.files:
        files = request.files.getlist('files')
        if not files or files[0].filename == '':
            return jsonify({"error": "No files selected"}), 400
        
        for file in files:
            if file.filename == '': continue
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            
            try:
                text = extract_text_from_file(filepath)
                if text: contents.append(text)
            except Exception as e:
                print(f"Error extracting text from {filename}: {e}")
                continue
        message = f"{len(contents)} file(s) processed."
    
    elif request.is_json and 'doc_ids' in request.json:
        doc_ids = request.json.get("doc_ids", [])
        try:
            contents = [extract_doc_text(doc_id) for doc_id in doc_ids]
            message = f"{len(doc_ids)} Google Doc(s) processed."
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    else:
        return jsonify({"error": "Invalid request format"}), 400
    
    if not contents:
        return jsonify({"error": "No content extracted"}), 400
    
    try:
        knowledge_base = setup_vector_store(contents)
    except RateLimitError as e:
        return jsonify({"error": "OpenAI/Gemini rate limit exceeded.", "details": str(e)}), 429
    except Exception as e:
        return jsonify({"error": "Failed to build knowledge base.", "details": str(e)}), 500
    
    return jsonify({"message": message})

@app.route('/ask', methods=['POST'])
def ask():
    global knowledge_base, conversations
    data = request.get_json(silent=True) or {}
    user_query = data.get('query', '')
    mode = data.get('mode', 'rag')
    
    # Granular parameters
    top_k = data.get('top_k', 4)
    threshold = data.get('threshold', 0.65)
    temperature = data.get('temperature', 0.0)
    strategy = data.get('strategy', 'strict')
    active_docs = data.get('active_docs', [])
    api_keys = data.get('api_keys', {})

    if not user_query:
        return jsonify({"answer": "No query provided."}), 400

    session_id = _get_session_id()
    history = conversations.setdefault(session_id, [])

    if mode == 'chatgpt':
        result = generate_answer_general(user_query, history, temperature=temperature, api_keys=api_keys)
    else:
        if not knowledge_base:
            return jsonify({"answer": "No documents loaded yet."})
            
        embeddings = get_embeddings_model(api_keys)
        try:
            query_vector = embeddings.embed_query(user_query)
        except Exception as e:
            return jsonify({"answer": f"Embedding error: {str(e)}", "sources": []}), 500
            
        # Semantic Cache Check
        for cached in semantic_cache:
            score = cosine_similarity(query_vector, cached["vector"])
            if score >= 0.95:
                result = {"answer": cached["answer"], "sources": [{"source": f"semantic_cache (score: {score:.3f})"}]}
                history.append({"role": "user", "content": user_query})
                history.append({"role": "assistant", "content": result["answer"]})
                return jsonify(result)

        result = generate_answer(
            user_query, 
            knowledge_base, 
            history,
            top_k=top_k,
            threshold=threshold,
            temperature=temperature,
            strategy=strategy,
            active_docs=active_docs,
            api_keys=api_keys
        )
        
        if result.get("sources"):
            semantic_cache.append({
                "vector": query_vector,
                "answer": result.get("answer", "")
            })
        
    answer = result.get("answer", "")
    history.append({"role": "user", "content": user_query})
    history.append({"role": "assistant", "content": answer})
    return jsonify(result)

@app.route('/ask_stream', methods=['POST'])
def ask_stream():
    global knowledge_base, conversations
    data = request.get_json(silent=True) or {}
    user_query = data.get('query', '')
    mode = data.get('mode', 'rag')

    # Granular parameters
    top_k = data.get('top_k', 4)
    threshold = data.get('threshold', 0.65)
    temperature = data.get('temperature', 0.0)
    strategy = data.get('strategy', 'strict')
    active_docs = data.get('active_docs', [])
    api_keys = data.get('api_keys', {})
    
    if not user_query:
        return Response("No query provided.", mimetype="text/plain", status=400)

    session_id = _get_session_id()
    history = conversations.setdefault(session_id, [])

    if mode == 'chatgpt':
        result = generate_answer_general(user_query, history, temperature=temperature, api_keys=api_keys)
        full_answer = result.get("answer", "")
    else:
        if not knowledge_base:
            return Response("No documents loaded yet.", mimetype="text/plain")
            
        embeddings = get_embeddings_model(api_keys)
        try:
            query_vector = embeddings.embed_query(user_query)
        except Exception:
            return Response("Embedding error", mimetype="text/plain", status=500)
            
        # Semantic Cache Check
        for cached in semantic_cache:
            score = cosine_similarity(query_vector, cached["vector"])
            if score >= 0.95:
                full_answer = cached["answer"]
                history.append({"role": "user", "content": user_query})
                history.append({"role": "assistant", "content": full_answer})

                @stream_with_context
                def generate_chunks_cached():
                    chunk_size = 64
                    for i in range(0, len(full_answer), chunk_size):
                        yield full_answer[i:i+chunk_size]
                        time.sleep(0.01)
                return Response(generate_chunks_cached(), mimetype="text/plain")

        result = generate_answer(
            user_query, 
            knowledge_base, 
            history,
            top_k=top_k,
            threshold=threshold,
            temperature=temperature,
            strategy=strategy,
            active_docs=active_docs,
            api_keys=api_keys
        )
        full_answer = result.get("answer", "")
        
        if result.get("sources"):
            semantic_cache.append({
                "vector": query_vector,
                "answer": full_answer
            })

    history.append({"role": "user", "content": user_query})
    history.append({"role": "assistant", "content": full_answer})

    @stream_with_context
    def generate_chunks():
        chunk_size = 64
        for i in range(0, len(full_answer), chunk_size):
            yield full_answer[i:i+chunk_size]
            time.sleep(0.01)

    return Response(generate_chunks(), mimetype="text/plain")

@app.route('/clear_chat', methods=['POST'])
def clear_chat():
    global conversations
    session_id = _get_session_id()
    if session_id in conversations:
        del conversations[session_id]
    return jsonify({"status": "cleared"})

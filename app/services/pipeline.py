import os
import pickle
from langchain_openai import ChatOpenAI
from langchain_community.vectorstores import FAISS
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_community.retrievers import BM25Retriever
from langchain.retrievers import EnsembleRetriever
from langchain_core.documents import Document
from dotenv import load_dotenv

load_dotenv()

def setup_vector_store(doc_texts, vector_store_dir="vectorstore"):
    """Create a FAISS vector store from raw document texts and save it."""
    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150)

    all_chunks = []
    all_metadatas = []

    for idx, text in enumerate(doc_texts):
        if not text:
            continue
        chunks = splitter.split_text(text)
        all_chunks.extend(chunks)
        source_id = f"doc_{idx+1}"
        all_metadatas.extend({"source": source_id, "chunk_index": i} for i in range(len(chunks)))

    gemini_key = os.getenv("GEMINI_API_KEY")
    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/text-embedding-004",
        google_api_key=gemini_key,
    )
    vector_store = FAISS.from_texts(all_chunks, embeddings, metadatas=all_metadatas)
    
    os.makedirs(vector_store_dir, exist_ok=True)
    vector_store.save_local(vector_store_dir)
    with open(os.path.join(vector_store_dir, "hybrid_data.pkl"), "wb") as f:
        pickle.dump({"chunks": all_chunks, "metadatas": all_metadatas}, f)
    
    return {
        "faiss": vector_store,
        "chunks": all_chunks,
        "metadatas": all_metadatas
    }

def load_vector_store(vector_store_dir="vectorstore"):
    """Load the FAISS vector store and hybrid search data from disk."""
    if not os.path.exists(vector_store_dir) or not os.path.exists(os.path.join(vector_store_dir, "hybrid_data.pkl")):
        return None
        
    try:
        gemini_key = os.getenv("GEMINI_API_KEY")
        embeddings = GoogleGenerativeAIEmbeddings(
            model="models/text-embedding-004",
            google_api_key=gemini_key,
        )
        vector_store = FAISS.load_local(vector_store_dir, embeddings, allow_dangerous_deserialization=True)
        
        with open(os.path.join(vector_store_dir, "hybrid_data.pkl"), "rb") as f:
            data = pickle.load(f)
            
        return {
            "faiss": vector_store,
            "chunks": data["chunks"],
            "metadatas": data["metadatas"]
        }
    except Exception as e:
        print(f"Error loading vector store: {e}")
        return None

def _format_history(history, max_turns: int = 6) -> str:
    """Turn a list of {role, content} dicts into a compact text block."""
    if not history:
        return ""
    recent = history[-max_turns:]
    lines = []
    for turn in recent:
        role = turn.get("role", "user")
        prefix = "User" if role == "user" else "Assistant"
        content = (turn.get("content") or "").strip()
        if content:
            lines.append(f"{prefix}: {content}")
    return "\n".join(lines) if lines else ""

def generate_answer(query, knowledge_dict, history=None, top_k=4, threshold=0.65, temperature=0.0, strategy='strict', active_docs=None, api_keys=None):
    """Retrieve relevant chunks using Hybrid Search (FAISS + BM25) and ask the model."""
    faiss_store = knowledge_dict["faiss"]
    chunks = knowledge_dict["chunks"]
    metadatas = knowledge_dict["metadatas"]

    # 1. Prepare BM25 Retriever
    filtered_docs = []
    for chunk, metadata in zip(chunks, metadatas):
        if active_docs and metadata.get("source") not in active_docs:
            continue
        filtered_docs.append(Document(page_content=chunk, metadata=metadata))
    
    # If no documents match the filter, fallback or return empty
    if not filtered_docs:
        return {"answer": "No documents match the active filter.", "sources": []}
    
    bm25_retriever = BM25Retriever.from_documents(filtered_docs)
    bm25_retriever.k = top_k

    # 2. Prepare FAISS Retriever
    search_kwargs = {"k": top_k, "score_threshold": threshold}
    if active_docs:
        search_kwargs["filter"] = lambda md: md.get("source") in active_docs

    faiss_retriever = faiss_store.as_retriever(
        search_type="similarity_score_threshold",
        search_kwargs=search_kwargs
    )

    # 3. Ensemble (Reciprocal Rank Fusion)
    ensemble_retriever = EnsembleRetriever(
        retrievers=[bm25_retriever, faiss_retriever],
        weights=[0.5, 0.5]
    )
    docs = ensemble_retriever.invoke(query)

    context = "\n\n".join(d.page_content for d in docs)
    history_block = _format_history(history)

    prompt_parts = []
    if strategy == 'strict':
        prompt_parts.extend([
            "You are a strict technical assistant. Base your answer ONLY on the provided context.",
            "If the answer is not in the context, say 'I don't know' and do not hallucinate."
        ])
    elif strategy == 'code':
        prompt_parts.extend([
            "You are an expert Code Reviewer. Analyze the context and answer the user's question.",
            "Prioritize syntax formatting, architectural patterns, and functional code blocks over prose."
        ])
    else: # creative
        prompt_parts.extend([
            "You are a creative synthesizer.",
            "Use the provided context as a strong foundation, but feel free to synthesize broad concepts and brainstorm ideas."
        ])

    if history_block:
        prompt_parts.append("\nPrevious conversation:\n" + history_block)

    prompt_parts.append("\nContext:\n" + (context if context else "No relevant context found."))
    prompt_parts.append(f"\nQuestion: {query}\nAnswer:")

    prompt = "\n".join(prompt_parts)

    gemini_key = (api_keys and api_keys.get("gemini")) or os.getenv("GEMINI_API_KEY")
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        google_api_key=gemini_key,
        temperature=temperature
    )
    response = llm.invoke(prompt)
    answer_text = getattr(response, "content", str(response))

    sources = [d.metadata for d in docs]
    return {"answer": answer_text, "sources": sources}

def generate_answer_general(query, history=None, temperature=0.0, api_keys=None):
    """General chat mode: answer using GPT-4o-mini (no RAG)."""
    history_block = _format_history(history)

    prompt_parts = [
        "You are a helpful assistant.",
        "Answer clearly and concisely using your own knowledge.",
    ]

    if history_block:
        prompt_parts.append("\nPrevious conversation:\n" + history_block)

    prompt_parts.append(f"\nQuestion: {query}\nAnswer:")

    prompt = "\n".join(prompt_parts)

    openai_key = (api_keys and api_keys.get("openai")) or os.getenv("OPENAI_API_KEY")
    llm = ChatOpenAI(
        model="gpt-4o-mini",
        openai_api_key=openai_key,
        temperature=temperature
    )
    response = llm.invoke(prompt)
    answer_text = getattr(response, "content", str(response))
    return {"answer": answer_text, "sources": []}

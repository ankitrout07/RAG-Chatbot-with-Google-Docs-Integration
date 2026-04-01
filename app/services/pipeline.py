import os
from langchain_openai import ChatOpenAI
from langchain_community.vectorstores import FAISS
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from dotenv import load_dotenv

load_dotenv()

def setup_vector_store(doc_texts):
    """Create a FAISS vector store from raw document texts."""
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
    return vector_store

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

def generate_answer(query, vector_store, history=None):
    """Retrieve relevant chunks and ask the Gemini chat model for an answer."""
    retriever = vector_store.as_retriever()
    docs = retriever.invoke(query)

    context = "\n\n".join(d.page_content for d in docs)
    history_block = _format_history(history)

    prompt_parts = [
        "You are a helpful assistant that answers questions based only on the provided context.",
        "If the answer is not in the context, say you don't know.",
    ]

    if history_block:
        prompt_parts.append("\nPrevious conversation:\n" + history_block)

    prompt_parts.append("\nContext:\n" + context)
    prompt_parts.append(f"\nQuestion: {query}\nAnswer:")

    prompt = "\n".join(prompt_parts)

    gemini_key = os.getenv("GEMINI_API_KEY")
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",  # Switched to 2.0-flash as a common default
        google_api_key=gemini_key,
    )
    response = llm.invoke(prompt)
    answer_text = getattr(response, "content", str(response))

    sources = [d.metadata for d in docs]
    return {"answer": answer_text, "sources": sources}

def generate_answer_general(query, history=None):
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

    openai_key = os.getenv("OPENAI_API_KEY")
    llm = ChatOpenAI(
        model="gpt-4o-mini",
        openai_api_key=openai_key,
    )
    response = llm.invoke(prompt)
    answer_text = getattr(response, "content", str(response))
    return {"answer": answer_text, "sources": []}

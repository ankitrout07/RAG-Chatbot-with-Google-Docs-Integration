from langchain_openai import ChatOpenAI
from langchain_community.vectorstores import FAISS
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from dotenv import load_dotenv
import os

load_dotenv()


def setup_vector_store(doc_texts):
    """Create a FAISS vector store from raw document texts.

    Uses LangChain's RecursiveCharacterTextSplitter to chunk documents
    for better retrieval quality, and stores simple source metadata
    so we can surface citations later.
    """
    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150)

    all_chunks = []
    all_metadatas = []

    for idx, text in enumerate(doc_texts):
        if not text:
            continue
        # split_text expects a string; returns list[str]
        chunks = splitter.split_text(text)
        all_chunks.extend(chunks)
        # Tag each chunk with a simple source id
        source_id = f"doc_{idx+1}"
        all_metadatas.extend({"source": source_id, "chunk_index": i} for i in range(len(chunks)))

    # Use Gemini embeddings for RAG (avoids OpenAI rate limits on uploads)
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
    # take the last N messages
    recent = history[-max_turns:]
    lines = []
    for turn in recent:
        role = turn.get("role", "user")
        prefix = "User" if role == "user" else "Assistant"
        content = (turn.get("content") or "").strip()
        if content:
            lines.append(f"{prefix}: {content}")
    if not lines:
        return ""
    return "\n".join(lines)


def generate_answer(query, vector_store, history=None):
    """Retrieve relevant chunks and ask the OpenAI chat model for an answer.

    Returns a dict of the form:
        {"answer": str, "sources": [metadata_dict, ...]}

    `history` is an optional list of previous turns for this user session,
    e.g. [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}, ...].
    """
    retriever = vector_store.as_retriever()
    docs = retriever.get_relevant_documents(query)

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

    # Use Gemini for RAG answers (doc-grounded)
    gemini_key = os.getenv("GEMINI_API_KEY")
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",  # widely supported Gemini chat model
        google_api_key=gemini_key,
    )
    response = llm.invoke(prompt)

    # ChatOpenAI returns a ChatMessage object; extract its content
    answer_text = getattr(response, "content", str(response))

    sources = [d.metadata for d in docs]
    return {"answer": answer_text, "sources": sources}


def generate_answer_general(query, history=None):
    """General chat mode: answer using the model's own knowledge (no RAG).

    Returns the same shape as generate_answer but without sources.
    """
    history_block = _format_history(history)

    prompt_parts = [
        "You are a helpful assistant.",
        "Answer clearly and concisely using your own knowledge.",
    ]

    if history_block:
        prompt_parts.append("\nPrevious conversation:\n" + history_block)

    prompt_parts.append(f"\nQuestion: {query}\nAnswer:")

    prompt = "\n".join(prompt_parts)

    # Use ChatGPT for general chat (no RAG)
    openai_key = os.getenv("OPENAI_API_KEY")
    llm = ChatOpenAI(
        model="gpt-4o-mini",
        openai_api_key=openai_key,
    )
    response = llm.invoke(prompt)

    answer_text = getattr(response, "content", str(response))
    return {"answer": answer_text, "sources": []}

<div align="center">

# 🧠 RAG Chatbot with Google Docs Integration

**A premium Retrieval-Augmented Generation (RAG) chatbot powered by Gemini & GPT-4o-mini, with native Google Docs connectivity.**

[![Python](https://img.shields.io/badge/Python-3.9%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.x-000000?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![LangChain](https://img.shields.io/badge/LangChain-0.3-1C3C3C?style=for-the-badge&logo=langchain&logoColor=white)](https://www.langchain.com/)
[![Google Gemini](https://img.shields.io/badge/Gemini-2.0_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)
[![FAISS](https://img.shields.io/badge/FAISS-Vector_Search-00A1E0?style=for-the-badge)](https://faiss.ai/)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)

*Ask questions grounded in your own documents — no hallucinations, no guessing.*

</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| 📂 **Multi-Source Ingestion** | Upload PDF, DOCX, or TXT files, or connect directly to your Google Drive docs |
| 🧠 **RAG Mode (Gemini)** | Answers strictly grounded in your uploaded context via FAISS vector retrieval |
| 💬 **General Mode (GPT-4o-mini)** | Open-ended Q&A using OpenAI without document context |
| 🔄 **Streaming Responses** | Token-by-token streaming output for a live, real-time feel |
| 📜 **Citations Panel** | Toggle to reveal exactly which document chunks informed each answer |
| 🎙️ **Voice Input** | Speak your question directly into the chat using Web Speech API |
| 💾 **Session History** | Multi-session sidebar — create, rename, delete, and switch chat sessions |
| 🌗 **Dark / Light Mode** | Full theme system with glassmorphism panels and animated background blobs |
| ⚡ **System Health Dashboard** | Live check of backend, vector store, and API key status |
| 🔐 **Google OAuth Integration** | OAuth 2.0 flow for secure Google Docs access |

---

## 🎨 Interface Highlights

The frontend is built with a premium, modern design system:

- **Glassmorphism** — semi-transparent panels with `backdrop-filter: blur` across navbar, chat, and modals
- **Animated Background** — three floating blur blobs with living neon glow, driven by CSS `@keyframes`
- **Mouse Spotlight** — an interactive radial glow tracks the cursor across the page
- **Reactive Tech Cards** — hover glow follows the mouse inside each card using CSS custom properties
- **Voice Wave Visualizer** — 7-bar audio animation appears when the microphone is recording
- **Full-Screen Chat Dashboard** — `95vw × 90vh` chat overlay with sidebar history + main message area
- **Fluid Typography** — `Plus Jakarta Sans` headings with responsive `clamp()` sizing

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                  Browser (SPA)                  │
│  HTML / CSS (Glassmorphism) / Vanilla JS        │
└──────────────────┬──────────────────────────────┘
                   │  HTTP / SSE Streaming
┌──────────────────▼──────────────────────────────┐
│              Flask API (routes.py)              │
│  GET  /          →  Landing page                │
│  POST /load_docs →  Ingest files / Google Docs  │
│  POST /ask       →  RAG or General answer (JSON)│
│  POST /ask_stream→  Streaming answer (SSE)      │
│  GET  /fetch_docs→  List Google Drive docs      │
│  GET  /health    →  System health check         │
│  POST /clear_chat→  Reset session memory        │
└──────┬───────────────────────┬──────────────────┘
       │                       │
┌──────▼──────┐        ┌───────▼──────────────────┐
│   FAISS     │        │       LangChain           │
│ Vector Store│◄───────│  Text Splitter + Embeddings│
│ (in-memory) │        │  (Gemini text-embedding-004)│
└─────────────┘        └───────────────────────────┘
       │ retrieve top-k chunks
┌──────▼──────────────────────────────────────────┐
│             LLM Answer Generation               │
│  RAG Mode    → Gemini 2.0 Flash (grounded)      │
│  General Mode→ GPT-4o-mini (open-ended)         │
└─────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
RAG-Chatbot-with-Google-Docs-Integration/
├── app/
│   ├── __init__.py              # App factory — Flask config, upload folder
│   ├── routes.py                # All API endpoints
│   └── services/
│       ├── auth.py              # Google OAuth + Docs API
│       ├── document_service.py  # PDF / DOCX / TXT text extraction
│       └── pipeline.py          # FAISS setup, Gemini/OpenAI answer generation
│
├── static/
│   ├── css/body.css             # Full design system — glassmorphism, blobs, typography
│   └── js/main.js               # SPA logic — chat, upload, sessions, voice, animations
│
├── templates/
│   └── index.html               # Single-page application shell
│
├── uploads/                     # Temp staging for uploaded files
├── docs/                        # Additional documentation
├── .env.example                 # Environment variable template
├── requirements.txt             # Python dependencies
└── run.py                       # Development server entry point
```

---

## 🛠️ Setup & Installation

### Prerequisites

- Python 3.9+
- An **OpenAI API Key** — for GPT-4o-mini general chat mode
- A **Google Gemini API Key** — for embeddings and RAG answer generation
- A **Google Cloud Platform** project with the Google Docs API enabled (for Google Drive integration)

---

### 1. Clone the Repository

```bash
git clone https://github.com/ankitrout07/RAG-Chatbot-with-Google-Docs-Integration.git
cd RAG-Chatbot-with-Google-Docs-Integration
```

### 2. Create a Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate        # macOS / Linux
# venv\Scripts\activate         # Windows
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables

Copy the example file and fill in your keys:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Flask session signing key
FLASK_SECRET_KEY=your_secret_key_here

# OpenAI — used for GPT-4o-mini (General chat mode)
OPENAI_API_KEY=your_openai_api_key_here

# Google Gemini — used for text-embedding-004 and Gemini 2.0 Flash (RAG mode)
GEMINI_API_KEY=your_gemini_api_key_here
```

### 5. Google Docs Integration (Optional)

To enable Google Drive document fetching:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project and enable the **Google Docs API** and **Google Drive API**
3. Create **OAuth 2.0 Credentials** (Desktop App) and download the JSON file
4. Rename it to `credentials.json` and place it in the project root directory

### 6. Run the Application

```bash
python run.py
```

Open **[http://localhost:8000](http://localhost:8000)** in your browser.

---

## 🚀 Usage Guide

### Uploading Local Documents
1. Click **💬 Start Chat** to open the chat dashboard
2. In the upload panel, drag & drop or click to browse for `.pdf`, `.docx`, or `.txt` files
3. Files are processed, chunked, embedded, and indexed into FAISS automatically
4. Ask questions — the assistant answers using only your uploaded context

### Connecting Google Docs
1. Click **🔐 Connect Google Docs** in the navbar or hero
2. Authenticate with your Google account via OAuth
3. Select documents from the picker modal and click **Load Documents**
4. Start querying your Drive documents instantly

### Chat Modes
| Mode | Toggle | Behaviour |
|---|---|---|
| **Gemini (RAG)** | Toggle OFF | Answers grounded in your uploaded documents via FAISS retrieval |
| **ChatGPT** | Toggle ON | Open-ended answers from GPT-4o-mini using general knowledge |

### Voice Input
Click the **🎙️** microphone button — speak your question — it will auto-submit.

---

## 🔌 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serve the frontend |
| `GET` | `/health` | System health: backend, vector store, API keys |
| `GET` | `/fetch_docs` | Trigger OAuth + list available Google Docs |
| `POST` | `/load_docs` | Ingest files (`multipart`) or Google Doc IDs (`JSON`) |
| `POST` | `/ask` | Non-streaming answer with sources |
| `POST` | `/ask_stream` | Streaming plain-text answer (Server-Sent Events) |
| `POST` | `/clear_chat` | Reset the server-side conversation history |

---

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python, Flask 3.x |
| **AI / LLM** | Google Gemini 2.0 Flash, OpenAI GPT-4o-mini |
| **Embeddings** | Google `text-embedding-004` via LangChain |
| **Vector Store** | FAISS (in-memory) |
| **Orchestration** | LangChain 0.3 |
| **Document Parsing** | PyPDF2, pdfplumber, python-docx |
| **Google Integration** | google-auth-oauthlib, google-api-python-client |
| **Frontend** | Vanilla HTML, CSS (Glassmorphism), JavaScript |
| **Fonts** | Plus Jakarta Sans, Inter (Google Fonts) |

---

## 👥 Team

| Name | Role |
|---|---|
| **Ankit Anupam Rout** | Lead Developer — Frontend & AI |
| **Deepanjal Sood** | Backend Developer — RAG Integration |
| **Dr. Lokesh Pawar** | Project Advisor |

---

## 🛡️ License

MIT License — Created for Academic Project Presentation.

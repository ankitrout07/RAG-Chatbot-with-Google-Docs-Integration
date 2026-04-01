# WayneTech RAG Chatbot

An advanced Retrieval-Augmented Generation (RAG) chatbot with integrated Google Docs support. Upload local documents or sync directly from your Google Drive to create a personalized knowledge base for AI-driven querying.

## 🚀 Features

- **Multi-Source Knowledge Base**: Upload PDF, DOCX, or TXT files, or connect directly to Google Docs.
- **Hybrid AI Engine**: 
  - **RAG Mode**: Uses Google Gemini for grounded, context-aware responses.
  - **General Mode**: Uses GPT-4o-mini for broad knowledge queries.
- **Premium Interface**: A sleek, WayneTech-inspired dark UI with streaming responses, progress bars, and voice input.
- **Smart Retrieval**: Powered by FAISS vector search and Gemini embeddings.

## 📁 Project Structure

```text
├── app/                  # Application package
│   ├── services/         # Logic services (Auth, Pipeline, Documents)
│   ├── routes.py         # Flask API endpoints
│   └── __init__.py       # App factory
├── static/               # Frontend assets (CSS, JS)
├── templates/            # HTML frontend
├── docs/                 # Documentation and release notes
├── uploads/              # Local file staging
├── requirements.txt      # Project dependencies
└── run.py                # Server entry point
```

## 🛠️ Setup Instructions

### 1. Prerequisites
- Python 3.9+
- OpenAI API Key
- Google Gemini API Key
- Google Cloud Platform (GCP) credentials for Google Docs integration.

### 2. Environment Configuration
Create a `.env` file in the root directory (refer to `.env.example`):
```bash
FLASK_SECRET_KEY=your_secret_key
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key
```

### 3. Google Integration
Place your `credentials.json` from the GCP Console into the root directory to enable Google Docs connectivity.

### 4. Installation
```bash
pip install -r requirements.txt
```

### 5. Running the Application
```bash
python run.py
```
Open [http://localhost:8000](http://localhost:8000) in your browser.

## 🛡️ License
MIT License - Created for Project Presentation.

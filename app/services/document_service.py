import os
import pdfplumber
import docx

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

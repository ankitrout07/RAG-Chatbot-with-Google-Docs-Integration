from app import create_app
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = create_app()

if __name__ == "__main__":
    print("\nWayneTech AI RAG Chatbot")
    print("-------------------------")
    print("Starting Flask server on http://localhost:8000")
    print("Press CTRL+C to quit\n")
    
    # Run the application
    app.run(host="127.0.0.1", port=8000, debug=True)

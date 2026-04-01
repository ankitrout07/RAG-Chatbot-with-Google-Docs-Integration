import os
from flask import Flask

def create_app():
    # Resolve the base directory of the project
    BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    
    app = Flask(
        __name__,
        template_folder=os.path.join(BASE_DIR, 'templates'),
        static_folder=os.path.join(BASE_DIR, 'static'),
    )
    
    # Basic secret key for signing session cookies
    app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-secret-key-change-me")
    
    # Upload configuration
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
    app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024  # 32MB max file size
    
    # Register blueprints or routes
    with app.app_context():
        from . import routes
        
    return app

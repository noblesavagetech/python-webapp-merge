from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
import os
from dotenv import load_dotenv
import json
from pathlib import Path

from services.openrouter_service import OpenRouterService
from services.file_service import FileService
from services.database_service import get_db, init_db
from services.auth_service import (
    verify_password, 
    get_password_hash, 
    create_access_token, 
    decode_access_token
)
from services.story_service import StoryService
from models import User, Project, Document, ChatMessage, FileUpload, Story, Chapter, Character, BeatScene, WorldBuildingElement, KeyEvent

# Lazy import for vector service to avoid chromadb dependency issues
try:
    from services.vector_service import VectorService
    VECTOR_SERVICE_AVAILABLE = True
except ImportError as e:
    print(f"Warning: VectorService not available: {e}")
    VectorService = None
    VECTOR_SERVICE_AVAILABLE = False

load_dotenv()

app = FastAPI(title="Membrane API", version="1.0.0")

# Initialize database
init_db()

# CORS configuration - allow Codespaces, localhost, and Railway
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://*.app.github.dev",
        "https://*.githubpreview.dev",
        "https://*.railway.app",
        "https://*.up.railway.app"
    ],
    allow_origin_regex=r"https://.*\.app\.github\.dev|https://.*\.githubpreview\.dev|https://.*\.railway\.app|https://.*\.up\.railway\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Initialize services
openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
openrouter = OpenRouterService(api_key=openrouter_api_key)

# Try to initialize vector service, but make it optional
vector_service = None
if VECTOR_SERVICE_AVAILABLE:
    try:
        vector_service = VectorService(
            database_url=os.getenv("DATABASE_URL"),
            openrouter_api_key=openrouter_api_key
        )
        print("VectorService initialized successfully")
    except Exception as e:
        print(f"Warning: Could not initialize VectorService: {e}")

file_service = FileService(upload_dir=os.getenv("UPLOAD_DIR", "./data/uploads"))
story_service = StoryService(openrouter_api_key=openrouter_api_key)

# Authentication dependency
async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user from JWT token. In dev mode, creates/uses default user if no auth."""
    
    # Development mode: allow unauthenticated access with default user
    if not authorization or not authorization.startswith("Bearer "):
        # Get or create default dev user
        dev_user = db.query(User).filter(User.email == "dev@example.com").first()
        if not dev_user:
            dev_user = User(
                email="dev@example.com",
                password_hash=get_password_hash("dev123"),
                name="Dev User"
            )
            db.add(dev_user)
            db.commit()
            db.refresh(dev_user)
        return dev_user
    
    token = authorization.replace("Bearer ", "")
    payload = decode_access_token(token)
    
    if not payload or "user_id" not in payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = db.query(User).filter(User.id == payload["user_id"]).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user

# Request/Response Models
class SignupRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class DocumentUpdate(BaseModel):
    content: str

# Models
class ChatRequest(BaseModel):
    message: str
    document_content: str
    selected_text: Optional[str] = None
    purpose: str = "writing"
    partner: str = "balanced"
    model: str = "anthropic/claude-3.5-sonnet"
    
class GhostSuggestionRequest(BaseModel):
    text: str
    cursor_position: int
    purpose: str
    model: str = "anthropic/claude-3.5-sonnet"
    
class MemoryRequest(BaseModel):
    content: str
    
class SearchMemoryRequest(BaseModel):
    query: str
    top_k: int = 5

# Story Request/Response Models
class StoryCreate(BaseModel):
    title: str
    description: Optional[str] = None

class StoryUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None

class ChapterCreate(BaseModel):
    title: Optional[str] = None
    text: Optional[str] = None

class ChapterUpdate(BaseModel):
    title: Optional[str] = None
    text: Optional[str] = None
    summary: Optional[str] = None

class CharacterCreate(BaseModel):
    name: str
    traits: Optional[str] = None
    backstory: Optional[str] = None

class BeatSceneCreate(BaseModel):
    description: str
    order: Optional[int] = None

class WorldBuildingCreate(BaseModel):
    category: str
    description: str

class KeyEventCreate(BaseModel):
    description: str
    order: Optional[int] = None

class AIGenerateRequest(BaseModel):
    context: str
    type: str  # 'summary', 'character', 'plot', 'beats', 'worldbuilding'
    category: Optional[str] = None  # For world-building

class ChapterSummarizeRequest(BaseModel):
    text: str
    prompt: Optional[str] = None

# Authentication Endpoints
@app.post("/api/auth/signup", response_model=AuthResponse)
async def signup(request: SignupRequest, db: Session = Depends(get_db)):
    """Create a new user account"""
    # Validate password length (bcrypt has 72 byte limit)
    if len(request.password) > 72:
        raise HTTPException(status_code=400, detail="Password too long (max 72 characters)")
    
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password too short (min 6 characters)")
    
    # Check if user exists
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user = User(
        email=request.email,
        password_hash=get_password_hash(request.password),
        name=request.name
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Create access token
    access_token = create_access_token(data={"user_id": user.id, "email": user.email})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name
        }
    }

@app.post("/api/auth/login", response_model=AuthResponse)
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Login with email and password"""
    user = db.query(User).filter(User.email == request.email).first()
    
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Create access token
    access_token = create_access_token(data={"user_id": user.id, "email": user.email})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name
        }
    }

@app.get("/api/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info"""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name
    }

# Project Endpoints
@app.get("/api/projects")
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all projects for the current user"""
    projects = db.query(Project).filter(Project.user_id == current_user.id).all()
    return {
        "projects": [
            {
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "created_at": p.created_at.isoformat(),
                "updated_at": p.updated_at.isoformat()
            }
            for p in projects
        ]
    }

@app.post("/api/projects")
async def create_project(
    request: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new project"""
    project = Project(
        user_id=current_user.id,
        name=request.name,
        description=request.description
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    
    # Create initial empty document for this project
    document = Document(project_id=project.id, content="")
    db.add(document)
    db.commit()
    
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "created_at": project.created_at.isoformat(),
        "updated_at": project.updated_at.isoformat()
    }

@app.get("/api/projects/{project_id}")
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific project"""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "created_at": project.created_at.isoformat(),
        "updated_at": project.updated_at.isoformat()
    }

@app.put("/api/projects/{project_id}")
async def update_project(
    project_id: int,
    request: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a project"""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if request.name is not None:
        project.name = request.name
    if request.description is not None:
        project.description = request.description
    
    db.commit()
    db.refresh(project)
    
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "created_at": project.created_at.isoformat(),
        "updated_at": project.updated_at.isoformat()
    }

@app.delete("/api/projects/{project_id}")
async def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a project"""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    db.delete(project)
    db.commit()
    
    return {"status": "success", "message": "Project deleted"}

# Document Endpoints
@app.get("/api/projects/{project_id}/document")
async def get_document(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get the document for a project"""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    document = db.query(Document).filter(Document.project_id == project_id).first()
    
    if not document:
        # Create if doesn't exist
        document = Document(project_id=project_id, content="")
        db.add(document)
        db.commit()
        db.refresh(document)
    
    return {
        "content": document.content,
        "updated_at": document.updated_at.isoformat()
    }

@app.put("/api/projects/{project_id}/document")
async def update_document(
    project_id: int,
    request: DocumentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update the document for a project"""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    document = db.query(Document).filter(Document.project_id == project_id).first()
    
    if not document:
        document = Document(project_id=project_id, content=request.content)
        db.add(document)
    else:
        document.content = request.content
    
    db.commit()
    db.refresh(document)
    
    return {
        "content": document.content,
        "updated_at": document.updated_at.isoformat()
    }

# Health check
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "membrane-api"}

# Chat endpoint with streaming
@app.post("/api/projects/{project_id}/chat/stream")
async def chat_stream(
    project_id: int,
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Stream AI responses in real-time"""
    # Verify project ownership
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get relevant memories from vector store
    collection_name = f"user_{current_user.id}_project_{project_id}"
    memories = []
    if vector_service and vector_service.enabled:
        try:
            memories = await vector_service.search(collection_name, request.message, top_k=3)
            print(f"✅ Found {len(memories)} memories for query: {request.message[:50]}...")
        except Exception as e:
            print(f"⚠️  Error searching memories: {e}")
    else:
        print("⚠️  Vector service not available for memory search")
    
    # Get recent chat history
    recent_messages = db.query(ChatMessage).filter(
        ChatMessage.project_id == project_id
    ).order_by(ChatMessage.created_at.desc()).limit(10).all()
    recent_messages.reverse()  # oldest first
    
    chat_history = "\n".join([
        f"{msg.role}: {msg.content[:500]}" for msg in recent_messages
    ]) if recent_messages else "(No previous conversation)"
    
    # Build context - include FULL document content
    context = f"""Purpose: {request.purpose}
Partner mode: {request.partner}

Full Document content:
{request.document_content}

{f"Selected text: {request.selected_text}" if request.selected_text else ""}

Recent conversation:
{chat_history}

Relevant memories from trained files:
{chr(10).join(f"- {m}" for m in memories)}
"""
    
    # Debug: Log what memories are being sent
    if memories:
        print(f"📋 Sending {len(memories)} memories to AI:")
        for i, mem in enumerate(memories[:3], 1):  # Show first 3
            print(f"   {i}. {mem[:100]}...")
    else:
        print("⚠️  No memories to send to AI")
    
    # Save user message to database
    user_message = ChatMessage(
        project_id=project_id,
        role="user",
        content=request.message,
        model=request.model
    )
    db.add(user_message)
    db.commit()
    
    assistant_response = ""
    
    async def generate():
        nonlocal assistant_response
        async for chunk in openrouter.stream_chat(
            message=request.message,
            context=context,
            model=request.model,
            partner=request.partner
        ):
            assistant_response += chunk
            yield f"data: {json.dumps({'content': chunk})}\n\n"
        
        # Save assistant message to database
        assistant_message = ChatMessage(
            project_id=project_id,
            role="assistant",
            content=assistant_response,
            model=request.model
        )
        db.add(assistant_message)
        db.commit()
        
        yield "data: [DONE]\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")

# Ghost suggestion endpoint
@app.post("/api/projects/{project_id}/ghost-suggest")
async def ghost_suggest(
    project_id: int,
    request: GhostSuggestionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate ghost-writing suggestions"""
    # Verify project ownership
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    suggestion = await openrouter.get_ghost_suggestion(
        text=request.text,
        cursor_position=request.cursor_position,
        purpose=request.purpose,
        model=request.model
    )
    return {"suggestion": suggestion}

# Memory endpoints
@app.post("/api/projects/{project_id}/memory/add")
async def add_memory(
    project_id: int,
    request: MemoryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add content to vector memory"""
    # Verify project ownership
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    collection_name = f"user_{current_user.id}_project_{project_id}"
    if vector_service:
        await vector_service.add_memory(collection_name, request.content)
    return {"status": "success", "message": "Memory added"}

@app.post("/api/projects/{project_id}/memory/search")
async def search_memory(
    project_id: int,
    request: SearchMemoryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Search vector memory"""
    # Verify project ownership
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    collection_name = f"user_{current_user.id}_project_{project_id}"
    if not vector_service:
        raise HTTPException(status_code=503, detail="Vector service unavailable")
    results = await vector_service.search(collection_name, request.query, request.top_k)
    return {"results": results}

# File upload endpoints
@app.post("/api/projects/{project_id}/upload/file")
async def upload_file(
    project_id: int,
    file: UploadFile = File(...),
    train: bool = True,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload files - either for training (adds to vector memory) or as context (reference only)"""
    try:
        # Verify project ownership
        project = db.query(Project).filter(
            Project.id == project_id,
            Project.user_id == current_user.id
        ).first()
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Save file with user/project scoping
        user_project_path = f"{current_user.id}/{project_id}"
        file_path = await file_service.save_upload(user_project_path, file)
        
        # Extract text content
        content = await file_service.extract_text(file_path)
        
        # Add ALL uploaded files to vector store (both train and context)
        # The difference is just metadata, not whether they're indexed
        processed_successfully = False
        if vector_service and vector_service.enabled:
            try:
                collection_name = f"user_{current_user.id}_project_{project_id}"
                file_type = "training" if train else "context"
                print(f"📤 Adding file '{file.filename}' to vector store as {file_type} (collection: {collection_name})")
                await vector_service.add_memory(
                    collection_name, 
                    content, 
                    metadata={"source": file.filename, "type": file_type}
                )
                processed_successfully = True
                print(f"✅ File '{file.filename}' added to vector store successfully")
            except Exception as e:
                print(f"❌ Could not add to vector store: {e}")
                import traceback
                traceback.print_exc()
                # Continue anyway - file is still saved
        else:
            print(f"⚠️  Vector service not available - file '{file.filename}' saved but not indexed")
        
        # Save file record to database
        file_record = FileUpload(
            project_id=project_id,
            filename=file.filename,
            filepath=file_path,
            file_size=os.path.getsize(file_path),
            mime_type=file.content_type,
            processed=processed_successfully  # Only mark as processed if vector service actually worked
        )
        db.add(file_record)
        db.commit()
        
        return {
            "status": "success",
            "filename": file.filename,
            "path": file_path,
            "size": os.path.getsize(file_path),
            "trained": train and vector_service is not None,
            "content": content  # Return content for context files
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Upload error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.get("/api/projects/{project_id}/upload/list")
async def list_uploads(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List uploaded files for a project"""
    # Verify project ownership
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    files = db.query(FileUpload).filter(FileUpload.project_id == project_id).all()
    
    return {
        "files": [
            {
                "id": f.id,
                "filename": f.filename,
                "file_size": f.file_size,
                "mime_type": f.mime_type,
                "processed": f.processed,
                "created_at": f.created_at.isoformat()
            }
            for f in files
        ]
    }

@app.delete("/api/projects/{project_id}/upload/file/{file_id}")
async def delete_upload(
    project_id: int,
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an uploaded file"""
    # Verify project ownership
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    file_record = db.query(FileUpload).filter(
        FileUpload.id == file_id,
        FileUpload.project_id == project_id
    ).first()
    
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Delete physical file
    if os.path.exists(file_record.filepath):
        os.remove(file_record.filepath)
    
    # Delete database record
    db.delete(file_record)
    db.commit()
    
    return {"status": "success", "message": f"Deleted {file_record.filename}"}

# Model list endpoint
@app.get("/api/models")
async def get_models():
    """Get list of available LLM models"""
    return {
        "models": [
            {
                "id": "anthropic/claude-3.5-sonnet",
                "name": "Claude 3.5 Sonnet",
                "provider": "Anthropic",
                "context_length": 200000
            },
            {
                "id": "x-ai/grok-4.1-fast",
                "name": "Grok 4.1 Fast",
                "provider": "xAI",
                "context_length": 131072
            },
            {
                "id": "deepseek/deepseek-v3.2",
                "name": "DeepSeek v3.2",
                "provider": "DeepSeek",
                "context_length": 64000
            },
            {
                "id": "openai/gpt-oss-120b",
                "name": "GPT-OSS-120B",
                "provider": "OpenAI",
                "context_length": 128000
            },
            {
                "id": "google/gemini-2.5-flash",
                "name": "Gemini 2.5 Flash",
                "provider": "Google",
                "context_length": 1000000
            }
        ]
    }

# ==================== STORY ENGINE ROUTES ====================

@app.get("/api/stories")
async def get_user_stories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all stories for the current user"""
    stories = story_service.get_user_stories(db, current_user.id)
    return {
        "stories": [
            {
                "id": s.id,
                "title": s.title,
                "description": s.description,
                "created_at": s.created_at.isoformat(),
                "updated_at": s.updated_at.isoformat()
            }
            for s in stories
        ]
    }

@app.post("/api/stories")
async def create_story(
    request: StoryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new story"""
    story = story_service.create_story(db, current_user.id, request.title, request.description)
    return {
        "story": {
            "id": story.id,
            "title": story.title,
            "description": story.description,
            "created_at": story.created_at.isoformat()
        }
    }

@app.get("/api/stories/{story_id}")
async def get_story(
    story_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a story with all its chapters and characters"""
    story = story_service.get_story(db, story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    
    return {
        "story": {
            "id": story.id,
            "title": story.title,
            "description": story.description,
            "chapters": [
                {
                    "id": c.id,
                    "title": c.title,
                    "text": c.text,
                    "summary": c.summary,
                    "order": c.order
                }
                for c in story.chapters
            ],
            "characters": [
                {
                    "id": char.id,
                    "name": char.name,
                    "traits": char.traits,
                    "backstory": char.backstory
                }
                for char in story.characters
            ]
        }
    }

@app.put("/api/stories/{story_id}")
async def update_story(
    story_id: int,
    request: StoryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a story"""
    story = story_service.update_story(db, story_id, current_user.id, **request.dict(exclude_unset=True))
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    
    return {"story": {"id": story.id, "title": story.title, "description": story.description}}

@app.delete("/api/stories/{story_id}")
async def delete_story(
    story_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a story"""
    success = story_service.delete_story(db, story_id, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Story not found")
    
    return {"message": "Story deleted successfully"}

# Chapter routes
@app.post("/api/stories/{story_id}/chapters")
async def create_chapter(
    story_id: int,
    request: ChapterCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new chapter in a story"""
    # Verify story ownership
    story = story_service.get_story(db, story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    
    chapter = story_service.create_chapter(db, story_id, request.title, request.text)
    return {"chapter": {"id": chapter.id, "title": chapter.title, "text": chapter.text}}

@app.put("/api/chapters/{chapter_id}")
async def update_chapter(
    chapter_id: int,
    request: ChapterUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a chapter"""
    chapter = story_service.get_chapter(db, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    
    # Verify ownership through story
    story = story_service.get_story(db, chapter.story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=403, detail="Access denied")
    
    updated_chapter = story_service.update_chapter(db, chapter_id, **request.dict(exclude_unset=True))
    return {
        "chapter": {
            "id": updated_chapter.id,
            "title": updated_chapter.title,
            "text": updated_chapter.text,
            "summary": updated_chapter.summary
        }
    }

@app.post("/api/chapters/{chapter_id}/summarize")
async def summarize_chapter(
    chapter_id: int,
    request: ChapterSummarizeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Summarize chapter text using Gemini"""
    chapter = story_service.get_chapter(db, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    
    # Verify ownership through story
    story = story_service.get_story(db, chapter.story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Default summarization prompt
    default_prompt = """Summarize the provided text passage:

REQUIREMENTS:
- Maximum length: 5 paragraphs
- Strictly based on the input text
- Chronological order of events
- Past tense narrative
- Focus on direct observations
- Include only information present in the source text

CRITICAL GUIDELINES:
- Every detail must be directly traceable to the original passage
- No external information or speculation
- Capture the most significant events and interactions
- Maintain a clear, factual tone
- Ensure comprehensive coverage within the paragraph limit"""
    
    prompt = request.prompt if request.prompt else default_prompt
    
    # Use Gemini for summarization
    summary = await openrouter.summarize_text(
        text=request.text,
        prompt=prompt,
        model="google/gemini-2.5-flash"
    )
    
    return {"summary": summary}

# Character routes
@app.post("/api/stories/{story_id}/characters")
async def create_character(
    story_id: int,
    request: CharacterCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new character in a story"""
    # Verify story ownership
    story = story_service.get_story(db, story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    
    character = story_service.create_character(db, story_id, request.name, request.traits, request.backstory)
    return {
        "character": {
            "id": character.id,
            "name": character.name,
            "traits": character.traits,
            "backstory": character.backstory
        }
    }

@app.get("/api/stories/{story_id}/characters")
async def get_characters(
    story_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all characters for a story"""
    # Verify story ownership
    story = story_service.get_story(db, story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    
    characters = db.query(Character).filter(Character.story_id == story_id).all()
    return {
        "characters": [
            {
                "id": c.id,
                "name": c.name,
                "traits": c.traits,
                "backstory": c.backstory
            }
            for c in characters
        ]
    }

@app.put("/api/stories/{story_id}/characters/{char_id}")
async def update_character(
    story_id: int,
    char_id: int,
    request: CharacterCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a character"""
    # Verify story ownership
    story = story_service.get_story(db, story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    
    character = db.query(Character).filter(Character.id == char_id, Character.story_id == story_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    if request.name:
        character.name = request.name
    if request.traits is not None:
        character.traits = request.traits
    if request.backstory is not None:
        character.backstory = request.backstory
    
    db.commit()
    db.refresh(character)
    
    return {
        "character": {
            "id": character.id,
            "name": character.name,
            "traits": character.traits,
            "backstory": character.backstory
        }
    }

@app.delete("/api/stories/{story_id}/characters/{char_id}")
async def delete_character(
    story_id: int,
    char_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a character"""
    # Verify story ownership
    story = story_service.get_story(db, story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    
    character = db.query(Character).filter(Character.id == char_id, Character.story_id == story_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    db.delete(character)
    db.commit()
    
    return {"message": "Character deleted"}

# Beat/Scene routes
@app.post("/api/chapters/{chapter_id}/beats")
async def create_beat(
    chapter_id: int,
    request: BeatSceneCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new beat/scene in a chapter"""
    # Verify chapter ownership through story
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    
    story = story_service.get_story(db, chapter.story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=403, detail="Access denied")
    
    beat = BeatScene(
        chapter_id=chapter_id,
        description=request.description,
        order=request.order
    )
    db.add(beat)
    db.commit()
    db.refresh(beat)
    
    return {
        "beat": {
            "id": beat.id,
            "description": beat.description,
            "order": beat.order
        }
    }

@app.get("/api/chapters/{chapter_id}/beats")
async def get_beats(
    chapter_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all beats/scenes for a chapter"""
    # Verify chapter ownership through story
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    
    story = story_service.get_story(db, chapter.story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=403, detail="Access denied")
    
    beats = db.query(BeatScene).filter(BeatScene.chapter_id == chapter_id).order_by(BeatScene.order).all()
    return {
        "beats": [
            {
                "id": b.id,
                "description": b.description,
                "order": b.order
            }
            for b in beats
        ]
    }

@app.put("/api/chapters/{chapter_id}/beats/{beat_id}")
async def update_beat(
    chapter_id: int,
    beat_id: int,
    request: BeatSceneCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a beat/scene"""
    # Verify chapter ownership through story
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    
    story = story_service.get_story(db, chapter.story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=403, detail="Access denied")
    
    beat = db.query(BeatScene).filter(BeatScene.id == beat_id, BeatScene.chapter_id == chapter_id).first()
    if not beat:
        raise HTTPException(status_code=404, detail="Beat not found")
    
    if request.description:
        beat.description = request.description
    if request.order is not None:
        beat.order = request.order
    
    db.commit()
    db.refresh(beat)
    
    return {
        "beat": {
            "id": beat.id,
            "description": beat.description,
            "order": beat.order
        }
    }

@app.delete("/api/chapters/{chapter_id}/beats/{beat_id}")
async def delete_beat(
    chapter_id: int,
    beat_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a beat/scene"""
    # Verify chapter ownership through story
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    
    story = story_service.get_story(db, chapter.story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=403, detail="Access denied")
    
    beat = db.query(BeatScene).filter(BeatScene.id == beat_id, BeatScene.chapter_id == chapter_id).first()
    if not beat:
        raise HTTPException(status_code=404, detail="Beat not found")
    
    db.delete(beat)
    db.commit()
    
    return {"message": "Beat deleted"}

# World Building routes
@app.post("/api/chapters/{chapter_id}/worldbuilding")
async def create_world_element(
    chapter_id: int,
    request: WorldBuildingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new world building element in a chapter"""
    # Verify chapter ownership through story
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    
    story = story_service.get_story(db, chapter.story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=403, detail="Access denied")
    
    element = WorldBuildingElement(
        chapter_id=chapter_id,
        category=request.category,
        description=request.description
    )
    db.add(element)
    db.commit()
    db.refresh(element)
    
    return {
        "element": {
            "id": element.id,
            "category": element.category,
            "description": element.description
        }
    }

@app.get("/api/chapters/{chapter_id}/worldbuilding")
async def get_world_elements(
    chapter_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all world building elements for a chapter"""
    # Verify chapter ownership through story
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    
    story = story_service.get_story(db, chapter.story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=403, detail="Access denied")
    
    elements = db.query(WorldBuildingElement).filter(WorldBuildingElement.chapter_id == chapter_id).all()
    return {
        "elements": [
            {
                "id": e.id,
                "category": e.category,
                "description": e.description
            }
            for e in elements
        ]
    }

@app.put("/api/chapters/{chapter_id}/worldbuilding/{elem_id}")
async def update_world_element(
    chapter_id: int,
    elem_id: int,
    request: WorldBuildingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a world building element"""
    # Verify chapter ownership through story
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    
    story = story_service.get_story(db, chapter.story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=403, detail="Access denied")
    
    element = db.query(WorldBuildingElement).filter(
        WorldBuildingElement.id == elem_id,
        WorldBuildingElement.chapter_id == chapter_id
    ).first()
    if not element:
        raise HTTPException(status_code=404, detail="World element not found")
    
    if request.category:
        element.category = request.category
    if request.description:
        element.description = request.description
    
    db.commit()
    db.refresh(element)
    
    return {
        "element": {
            "id": element.id,
            "category": element.category,
            "description": element.description
        }
    }

@app.delete("/api/chapters/{chapter_id}/worldbuilding/{elem_id}")
async def delete_world_element(
    chapter_id: int,
    elem_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a world building element"""
    # Verify chapter ownership through story
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    
    story = story_service.get_story(db, chapter.story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=403, detail="Access denied")
    
    element = db.query(WorldBuildingElement).filter(
        WorldBuildingElement.id == elem_id,
        WorldBuildingElement.chapter_id == chapter_id
    ).first()
    if not element:
        raise HTTPException(status_code=404, detail="World element not found")
    
    db.delete(element)
    db.commit()
    
    return {"message": "World element deleted"}

# Key Events routes
@app.post("/api/chapters/{chapter_id}/keyevents")
async def create_key_event(
    chapter_id: int,
    request: KeyEventCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new key event in a chapter"""
    # Verify chapter ownership through story
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    
    story = story_service.get_story(db, chapter.story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=403, detail="Access denied")
    
    event = KeyEvent(
        chapter_id=chapter_id,
        description=request.description,
        order=request.order
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    
    return {
        "event": {
            "id": event.id,
            "description": event.description,
            "order": event.order
        }
    }

@app.get("/api/chapters/{chapter_id}/keyevents")
async def get_key_events(
    chapter_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all key events for a chapter"""
    # Verify chapter ownership through story
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    
    story = story_service.get_story(db, chapter.story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=403, detail="Access denied")
    
    events = db.query(KeyEvent).filter(KeyEvent.chapter_id == chapter_id).order_by(KeyEvent.order).all()
    return {
        "events": [
            {
                "id": e.id,
                "description": e.description,
                "order": e.order
            }
            for e in events
        ]
    }

@app.put("/api/chapters/{chapter_id}/keyevents/{event_id}")
async def update_key_event(
    chapter_id: int,
    event_id: int,
    request: KeyEventCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a key event"""
    # Verify chapter ownership through story
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    
    story = story_service.get_story(db, chapter.story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=403, detail="Access denied")
    
    event = db.query(KeyEvent).filter(KeyEvent.id == event_id, KeyEvent.chapter_id == chapter_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Key event not found")
    
    if request.description:
        event.description = request.description
    if request.order is not None:
        event.order = request.order
    
    db.commit()
    db.refresh(event)
    
    return {
        "event": {
            "id": event.id,
            "description": event.description,
            "order": event.order
        }
    }

@app.delete("/api/chapters/{chapter_id}/keyevents/{event_id}")
async def delete_key_event(
    chapter_id: int,
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a key event"""
    # Verify chapter ownership through story
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    
    story = story_service.get_story(db, chapter.story_id, current_user.id)
    if not story:
        raise HTTPException(status_code=403, detail="Access denied")
    
    event = db.query(KeyEvent).filter(KeyEvent.id == event_id, KeyEvent.chapter_id == chapter_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Key event not found")
    
    db.delete(event)
    db.commit()
    
    return {"message": "Key event deleted"}

# AI Generation routes
@app.post("/api/ai/generate")
async def generate_ai_content(
    request: dict,
    current_user: User = Depends(get_current_user)
):
    """Generate AI content for story writing (prose or beat expansion)"""
    prompt = request.get('prompt', '')
    content_type = request.get('type', 'prose')
    model = request.get('model', 'deepseek/deepseek-chat-v3.1')  # Accept model from request
    
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")
    
    try:
        import httpx
        import os
        
        OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
        if not OPENROUTER_API_KEY:
            raise HTTPException(status_code=500, detail="OpenRouter API key not configured")
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": os.getenv("SITE_URL", "http://localhost:8000"),
                    "X-Title": os.getenv("SITE_NAME", "StoryEngine")
                },
                json={
                    "model": model,  # Use the model from the request
                    "messages": [{"role": "user", "content": prompt}]
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=f"OpenRouter API error: {response.text}")
            
            data = response.json()
            content = data.get('choices', [{}])[0].get('message', {}).get('content', '')
            
            return {"content": content, "type": content_type, "model": model}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")

@app.post("/api/stories/generate")
async def generate_story_content(
    request: AIGenerateRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate story content using AI"""
    
    async def generate():
        if request.type == "summary":
            result = await story_service.generate_chapter_summary(request.context)
            yield f"data: {json.dumps({'content': result})}\n\n"
        
        elif request.type == "character":
            result = await story_service.generate_character_development(
                request.context.split("name:")[1].strip() if "name:" in request.context else "Unknown",
                request.context
            )
            yield f"data: {json.dumps({'content': result})}\n\n"
        
        elif request.type == "plot":
            result = await story_service.generate_plot_suggestions(request.context)
            yield f"data: {json.dumps({'content': result})}\n\n"
        
        elif request.type == "beats":
            beats = await story_service.generate_scene_beats(request.context)
            yield f"data: {json.dumps({'beats': beats})}\n\n"
        
        elif request.type == "worldbuilding":
            result = await story_service.generate_world_building(request.category or "General", request.context)
            yield f"data: {json.dumps({'content': result})}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")

# ==================== END STORY ENGINE ROUTES ====================

@app.get("/api/models")
async def get_models():
    """Get available LLM models"""
    return {
        "models": [
            {
                "id": "anthropic/claude-3.7-sonnet",
                "name": "Claude 3.7 Sonnet",
                "provider": "Anthropic",
                "context_length": 200000
            },
            {
                "id": "x-ai/grok-4.1-fast",
                "name": "Grok 4.1 Fast",
                "provider": "xAI",
                "context_length": 131072
            },
            {
                "id": "deepseek/deepseek-v3.2",
                "name": "DeepSeek v3.2",
                "provider": "DeepSeek",
                "context_length": 64000
            },
            {
                "id": "openai/gpt-oss-120b",
                "name": "GPT-OSS-120B",
                "provider": "OpenAI",
                "context_length": 128000
            },
            {
                "id": "google/gemini-2.5-flash",
                "name": "Gemini 2.5 Flash",
                "provider": "Google",
                "context_length": 1000000
            }
        ]
    }

# Mount static files for production deployment (serve frontend)
# Static files are mounted AFTER all API routes so API takes precedence
static_dir = Path(__file__).parent.parent / "dist"
if static_dir.exists():
    # Mount assets directory for static files (JS, CSS, images)
    if (static_dir / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(static_dir / "assets")), name="assets")
    
    # Catch-all route for SPA - must be last and must not match /api/* routes
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Serve the SPA for all non-API routes"""
        # API routes are handled by FastAPI routes defined above - don't intercept them
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        
        # Try to serve the requested file
        file_path = static_dir / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        
        # Fall back to index.html for SPA routing
        index_path = static_dir / "index.html"
        if index_path.is_file():
            return FileResponse(index_path)
        
        raise HTTPException(status_code=404, detail="Not found")

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

# Membrane + Story Engine

A full-stack web application combining Membrane's collaborative writing platform with an AI-powered Story Engine for creative writing. Built to follow Railway and GitHub Codespaces SOP standards.

## Features

### Core Membrane Features
- 🎨 Beautiful dark-themed UI with Tailwind CSS
- 📝 Real-time collaborative document editing
- 💬 AI-powered chat assistance using OpenRouter
- 🧠 Vector-based memory and context management
- 📁 File upload and processing
- 🔐 User authentication and project management

### Story Engine Features
- 📚 Multi-story management system
- 📖 Chapter organization and editing
- 👥 Character development tracking
- 🎭 AI-assisted plot brainstorming
- 🌍 World-building tools
- ✨ Scene beat generation
- 📊 Story summary creation

## Tech Stack

**Frontend:**
- React + TypeScript
- Vite
- Tailwind CSS
- Context API for state management

**Backend:**
- FastAPI (Python)
- SQLAlchemy ORM
- PostgreSQL (production) / SQLite (development)
- ChromaDB for vector storage
- OpenRouter API for AI features

**Infrastructure:**
- Railway for deployment
- GitHub Codespaces for development
- Railway CLI for environment syncing

## SOP Compliance

This project follows strict operational standards:

✅ **Database Fallback**: Automatically uses PostgreSQL on Railway, falls back to SQLite for local development  
✅ **Railway CLI Integration**: Devcontainer includes Railway CLI  
✅ **Infrastructure Aware**: Handles cold-start scenarios gracefully  
✅ **Health Checks**: `/health` endpoint for Railway deployment validation  
✅ **Nixpacks Build**: Uses Railway's default Nixpacks builder  
✅ **Environment Syncing**: No manual .env copying required  
✅ **Procfile Standard**: Single source of truth for production startup

## Getting Started

### Option 1: GitHub Codespaces (Recommended)

1. Open in Codespaces
2. Wait for automatic setup to complete
3. Authenticate with Railway:
   ```bash
   railway login
   ```
4. Link to your Railway project:
   ```bash
   railway link
   ```
5. Start development servers:
   ```bash
   # Terminal 1 - Backend
   cd backend && railway run uvicorn main:app --reload
   
   # Terminal 2 - Frontend
   railway run npm run dev
   ```

### Option 2: Local Development

1. Clone the repository
2. Install Railway CLI:
   ```bash
   curl -fsSL https://railway.app/install.sh | sh
   ```
3. Run setup:
   ```bash
   # Backend dependencies
   cd backend && pip install -r requirements.txt
   
   # Frontend dependencies
   cd .. && npm install
   ```
4. Create `.env` file (see `.env.example`)
5. Link to Railway:
   ```bash
   railway login
   railway link
   ```
6. Start servers using Railway CLI for environment variables

## Environment Variables

Required environment variables:

```bash
# OpenRouter API (required)
OPENROUTER_API_KEY=your_key_here

# Database (auto-detected on Railway)
DATABASE_URL=postgresql://... # Provided by Railway

# Storage paths (optional, defaults provided)
VECTOR_DB_DIR=./data/vectordb
UPLOAD_DIR=./data/uploads

# JWT Secret (auto-generated if missing)
SECRET_KEY=your_secret_key
```

## Project Structure

```
.
├── backend/
│   ├── main.py              # FastAPI app entry point
│   ├── models.py            # SQLAlchemy models (includes Story Engine)
│   ├── services/
│   │   ├── auth_service.py
│   │   ├── database_service.py  # DB fallback logic
│   │   ├── story_service.py     # Story Engine AI features
│   │   ├── openrouter_service.py
│   │   ├── vector_service.py
│   │   └── file_service.py
│   ├── Procfile             # Railway start command
│   ├── railway.toml         # Railway configuration
│   └── requirements.txt
├── src/
│   ├── features/
│   │   ├── stories/         # Story Engine UI
│   │   ├── editor/          # Membrane editor
│   │   ├── dashboard/
│   │   ├── auth/
│   │   └── landing/
│   ├── services/
│   │   └── api.ts           # API client
│   └── context/
│       ├── AuthContext.tsx
│       └── ThemeContext.tsx
└── .devcontainer/           # Codespaces configuration
```

## API Endpoints

### Story Engine
- `GET /api/stories` - List user's stories
- `POST /api/stories` - Create new story
- `GET /api/stories/{id}` - Get story with chapters and characters
- `PUT /api/stories/{id}` - Update story
- `DELETE /api/stories/{id}` - Delete story
- `POST /api/stories/{id}/chapters` - Create chapter
- `PUT /api/chapters/{id}` - Update chapter
- `POST /api/stories/{id}/characters` - Create character
- `POST /api/stories/generate` - AI content generation

### Membrane Core
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `GET /api/projects` - List projects
- `POST /api/chat/stream` - AI chat streaming
- `POST /api/projects/{id}/memory/add` - Add to vector memory

## Railway Deployment

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard:
   - `OPENROUTER_API_KEY`
   - Add PostgreSQL database service
3. Railway will auto-deploy on push to main branch
4. Health check endpoint: `https://your-app.railway.app/health`

## Development Workflow

1. Make changes in Codespaces
2. Test with `railway run` commands to match production environment
3. Push to GitHub
4. Railway automatically builds and deploys
5. Monitor health checks and logs in Railway dashboard

## Dark Theme

The app features a beautiful dark theme with:
- Deep purples and indigos
- Smooth transitions
- Glowing hover effects
- Custom CSS variables for easy theming
- Consistent spacing and borders

## Contributing

1. All database changes must include fallback logic
2. Use Railway CLI for testing environment parity
3. Follow dark theme color scheme (see `App.css`)
4. API changes require frontend TypeScript types update
5. Test both SQLite and PostgreSQL paths

## License

MIT

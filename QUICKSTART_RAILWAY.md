# Quick Start Guide - Railway Deployment

## ⚡ Development in GitHub Codespaces

### First Time Setup
1. Open repository in Codespaces
2. Wait for automatic setup (installs Railway CLI, dependencies)
3. Authenticate with Railway:
   ```bash
   railway login
   ```
4. Link to your Railway project:
   ```bash
   railway link
   ```

### Daily Development Workflow
```bash
# Start backend with Railway environment
railway run python backend/main.py

# Or in a new terminal, start frontend
railway run npm run dev
```

The Railway CLI automatically injects environment variables from your Railway project.

## 🚀 Deploy to Railway

### Method 1: GitHub Integration (Recommended)
1. Push to `main` branch
2. Railway auto-deploys

### Method 2: Manual Deploy
```bash
railway up
```

## 📋 Railway Project Setup

### Required Services
1. **Web Service** - FastAPI backend
   - Auto-detected from `backend/` folder
   - Uses `Procfile` or `nixpacks.toml`
   
2. **PostgreSQL** (optional but recommended)
   - Add from Railway dashboard
   - `DATABASE_URL` automatically injected
   - App falls back to SQLite if not present

### Environment Variables
Set in Railway dashboard:
- `OPENROUTER_API_KEY` - Required for AI features
- `DATABASE_URL` - Auto-provided by PostgreSQL service
- `PORT` - Auto-provided by Railway

## 🏗️ How It Works

### Database Resilience
The app follows the **Cold-Start** pattern:
1. Checks for `DATABASE_URL` environment variable
2. If found: Uses PostgreSQL (fixes `postgres://` → `postgresql://`)
3. If missing: Falls back to local SQLite
4. Auto-creates schema on first boot

### Port Handling
- Uses `$PORT` environment variable (provided by Railway)
- Defaults to `8000` for local development

### Health Checks
Railway monitors: `GET /health`

## 🔧 Commands Reference

### Development
```bash
# Link to Railway project
railway link

# View environment variables
railway variables

# Run with Railway env
railway run [command]

# View logs
railway logs

# Open Railway dashboard
railway open
```

### Deployment
```bash
# Deploy current code
railway up

# Deploy specific environment
railway up --environment production
```

## 📁 Project Structure
```
backend/
  ├── main.py              # FastAPI app (uses $PORT)
  ├── models.py            # Database models
  ├── requirements.txt     # Python dependencies
  ├── Procfile            # Railway start command
  ├── nixpacks.toml       # Build configuration
  ├── railway.toml        # Railway settings
  └── services/
      └── database_service.py  # DB with fallback logic
```

## 🔐 Security Notes
- Never commit `.env` files
- Use Railway dashboard for production secrets
- JWT tokens stored in localStorage (client-side)
- CORS configured for Codespaces and Railway domains

## 🐛 Troubleshooting

### "Connection refused" errors
- Make sure backend is running: `railway run python backend/main.py`
- Check Railway logs: `railway logs`

### Database errors
- Verify PostgreSQL is added in Railway
- Check `DATABASE_URL` is set: `railway variables`
- App will use SQLite if no PostgreSQL (check logs)

### CORS errors
- Frontend must use correct backend URL
- Set `VITE_API_URL` if deploying frontend separately
- Railway URLs are auto-detected in `api.ts`

## 📚 More Info
- See [RAILWAY_DEPLOY.md](./RAILWAY_DEPLOY.md) for detailed deployment guide
- See [SOP Document] for operational standards

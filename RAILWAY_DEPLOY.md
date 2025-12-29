# Railway Deployment Guide

This application follows the **SOP: Codespaces & Railway Operational Standards**.

## Quick Deploy to Railway

### Prerequisites
1. **GitHub Codespaces** - Primary development environment
2. **Railway Account** - Production platform
3. **Railway CLI** - Already installed via `.devcontainer/setup.sh`

### First-Time Setup in Codespaces

```bash
# 1. Authenticate with Railway
railway login

# 2. Link to your Railway project (or create new)
railway link

# 3. Test with Railway environment variables
railway run python backend/main.py

# 4. Start frontend with Railway env
railway run npm run dev
```

## Railway Configuration

### Backend Service

The backend is configured with:
- **Build**: Nixpacks (automatic)
- **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Health Check**: `/health` endpoint
- **Database**: Auto-detects `DATABASE_URL` or falls back to SQLite

### Environment Variables

Required in Railway:
- `OPENROUTER_API_KEY` - Your OpenRouter API key for AI generation
- `DATABASE_URL` - Automatically provided by Railway PostgreSQL

Optional:
- `VECTOR_DB_DIR` - Path for vector database (default: `./data/vectordb`)
- `PORT` - Automatically provided by Railway

### Database Resilience

The app implements **cold-start resilience**:
1. ✅ Detects `DATABASE_URL` from Railway
2. ✅ Fixes `postgres://` → `postgresql://` automatically
3. ✅ Falls back to SQLite if no DATABASE_URL
4. ✅ Auto-creates schema on first boot via `init_db()`

## Deployment Workflow

### From Codespaces
```bash
# Push to main branch
git add .
git commit -m "Your changes"
git push

# Railway auto-deploys from GitHub
```

### Manual Deploy (if needed)
```bash
railway up
```

## Health Checks

Railway monitors: `GET /health`

Expected response:
```json
{
  "status": "healthy",
  "database": "connected",
  "vector_service": "available"
}
```

## Scaling Considerations

✅ **Stateless**: No local file storage (uses uploads to data dir, but should migrate to S3)
✅ **Session Management**: Uses JWT tokens in localStorage
✅ **Database Pooling**: Configured for multiple instances
⚠️ **File Uploads**: Currently local - migrate to S3/Cloudinary for production

## Frontend Deployment

The frontend should be deployed separately (Vercel/Netlify recommended):

1. Set `VITE_API_URL` to your Railway backend URL
2. Build: `npm run build`
3. Deploy `dist/` folder

Or use Railway for both:
```bash
# In project root
railway up
```

## Troubleshooting

### Database Connection Issues
Check Railway logs:
```bash
railway logs
```

The app will automatically:
- Use PostgreSQL if DATABASE_URL is set
- Fall back to SQLite if not
- Create tables on first boot

### Port Binding Issues
Ensure Procfile uses `$PORT`:
```
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

### CORS Issues
Update CORS in `backend/main.py` with your Railway domain:
```python
allow_origin_regex=r"https://.*\.up\.railway\.app"
```

## Monitoring

Railway provides:
- Automatic deployments from GitHub
- Health check monitoring
- Automatic rollbacks on failure
- Log aggregation
- Metrics dashboard

## Support

For issues, check:
1. Railway logs: `railway logs`
2. Health endpoint: `https://your-app.railway.app/health`
3. Database status in Railway dashboard

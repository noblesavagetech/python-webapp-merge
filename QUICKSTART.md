# Quick Start Guide

## First-Day Checklist (per SOP)

1. **Open in GitHub Codespaces**
   - Click "Code" → "Codespaces" → "Create codespace on main"
   - Wait for automatic setup (installs Railway CLI, dependencies)

2. **Authenticate with Railway**
   ```bash
   railway login
   ```
   - Opens browser for authentication
   - Authorizes your Railway account

3. **Link to Railway Project**
   ```bash
   railway link
   ```
   - Select your existing Railway project
   - Or create a new one

4. **Start Development**
   
   **Terminal 1 - Backend:**
   ```bash
   cd backend
   railway run uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```
   
   **Terminal 2 - Frontend:**
   ```bash
   railway run npm run dev
   ```

5. **Access the App**
   - Frontend: Click the port 5173 notification or check PORTS tab
   - Backend API: Port 8000
   - Both will open automatically in Codespaces

## Story Engine Features

### Create a Story
1. Sign up / Log in
2. Navigate to "Stories" (add to nav)
3. Click "+ New Story"
4. Enter title and description
5. Start adding chapters and characters

### AI-Powered Features
- **Chapter Summaries**: Auto-generate summaries from chapter text
- **Character Development**: AI-assisted character profiles
- **Plot Brainstorming**: Get story direction suggestions
- **Scene Beats**: Break chapters into scene beats
- **World Building**: Generate settings, cultures, magic systems

### Workflow
1. Create a story
2. Add characters
3. Create chapters
4. Write chapter text
5. Use AI to generate summaries, beats, plot ideas
6. Organize using chapter order

## Environment Variables

On Railway, set these in the dashboard:
- `OPENROUTER_API_KEY` - Your OpenRouter API key
- Add PostgreSQL database service (DATABASE_URL auto-set)

Local development:
- Copy `.env.example` to `.env`
- Add your `OPENROUTER_API_KEY`
- DATABASE_URL will auto-fallback to SQLite

## Database

**Production (Railway):**
- Uses PostgreSQL automatically
- Add "PostgreSQL" service in Railway
- DATABASE_URL is auto-injected

**Development (Codespaces/Local):**
- Uses SQLite automatically
- File stored at `backend/data/membrane.db`
- No configuration needed

## Troubleshooting

**Port not opening?**
- Check PORTS tab in Codespaces
- Ensure you're using Railway CLI: `railway run`

**Database errors?**
- Check DATABASE_URL in Railway dashboard
- Verify PostgreSQL service is linked
- Local: ensure `backend/data/` directory exists

**API not connecting?**
- Frontend auto-detects backend URL in Codespaces
- Check browser console for API_BASE_URL
- Ensure both servers are running

**Railway CLI not found?**
```bash
curl -fsSL https://railway.app/install.sh | sh
export PATH="$HOME/.railway/bin:$PATH"
```

## Next Steps

1. Customize the dark theme (`src/App.css`)
2. Add story navigation to main app
3. Extend AI features with more prompts
4. Add migrations with Alembic (optional)
5. Deploy to Railway for production

## Tips

- Use `railway run` for all commands to sync env vars
- Dark theme colors in CSS variables (--color-*)
- All API endpoints return JSON
- Story Engine is separate from Projects (can merge later)
- Health check: `/health` endpoint

## Support

See full README.md for complete documentation.

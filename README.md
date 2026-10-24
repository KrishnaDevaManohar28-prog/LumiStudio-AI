# LumiStudio AI — Every product deserves a studio.

Upload a product photo → describe a scene → AI edits it (OpenAI `gpt-image-1`) → compare → download PNG/JPEG at 1080×1920 (or 4:5, 1:1, 16:9).

## Local setup
**Backend** (Python 3.10+)
```
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add OPENAI_API_KEY
uvicorn main:app --reload --port 8000
```
**Frontend** (Node 18+)
```
cd frontend && npm install && npm run dev   # http://localhost:5173 (proxies /api to :8000)
```
Note: `gpt-image-1` requires an OpenAI organization with API image access enabled.

## Environment variables (backend)
`OPENAI_API_KEY` (required, server-only) · `OPENAI_IMAGE_MODEL` · `ALLOWED_ORIGINS` (comma list) · `RETENTION_DAYS` (default 30) · `RATE_LIMIT_PER_MIN` (default 5)
Frontend: `VITE_API_URL` (your deployed backend origin, e.g. https://api.example.com).

## Deployment
- **Frontend → Vercel**: root `frontend`, build `npm run build`, output `dist`, set `VITE_API_URL`.
- **Backend → Render/Railway/Fly**: root `backend`, start `uvicorn main:app --host 0.0.0.0 --port $PORT`, set env vars, set `ALLOWED_ORIGINS` to your Vercel URL. HTTPS is provided by these hosts. Use a persistent disk for `backend/data`.

## Current limitations (next steps)
Storage is local disk with no authentication (not production-ready: add auth + private object storage). No background segmentation/mask refinement yet, so product fidelity is not guaranteed. Favorites, Settings, template previews and advanced controls (lighting/shadow/mood/placement) are not built yet. The output is center-cropped to the target ratio.

## Troubleshooting
402 = provider out of credits · 429 = rate limit · 502 invalid key · "Network error" = backend not running or CORS origin mismatch.

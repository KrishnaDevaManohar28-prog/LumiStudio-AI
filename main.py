import base64, io, json, os, shutil, time, uuid
from collections import defaultdict, deque
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError
import openai

load_dotenv()
MAX_BYTES = 12 * 1024 * 1024
DATA = Path(__file__).parent / "data" / "projects"
DATA.mkdir(parents=True, exist_ok=True)
RETENTION_DAYS = int(os.getenv("RETENTION_DAYS", "30"))
RATE = int(os.getenv("RATE_LIMIT_PER_MIN", "5"))
MODEL = os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-1")
FORMATS = {  # export size, generation size
    "story": ((1080, 1920), "1024x1536"),
    "portrait": ((1080, 1350), "1024x1536"),
    "square": ((1080, 1080), "1024x1024"),
    "landscape": ((1920, 1080), "1536x1024"),
}
PRESERVE = (
    "Use the uploaded product as the exact visual reference. Preserve the product's shape, proportions, colors, "
    "texture, labels, logos, patterns and distinctive details. Do not redesign, duplicate or replace the product. "
    "Do not invent features or alter printed text. Change only the environment and background. Use natural "
    "perspective, realistic contact shadows, soft lighting and believable reflections. No added text, watermarks, "
    "badges or unnecessary objects. Keep the product centered with generous margins so it is not cropped."
)

app = FastAPI(title="LumiStudio AI")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")],
    allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"],
)
hits: dict[str, deque] = defaultdict(deque)

def purge():
    cutoff = time.time() - RETENTION_DAYS * 86400
    for d in DATA.iterdir():
        if d.is_dir() and d.stat().st_mtime < cutoff:
            shutil.rmtree(d, ignore_errors=True)

def limit(req: Request):
    ip, now = (req.client.host if req.client else "x"), time.time()
    q = hits[ip]
    while q and now - q[0] > 60: q.popleft()
    if len(q) >= RATE: raise HTTPException(429, "Too many requests. Please wait a minute and try again.")
    q.append(now)

@app.get("/api/health")
def health():
    return {"ok": True, "api_key_configured": bool(os.getenv("OPENAI_API_KEY")), "retention_days": RETENTION_DAYS}

@app.post("/api/generate")
async def generate(request: Request, image: UploadFile = File(...), prompt: str = Form(...),
                   scene: str = Form("custom"), category: str = Form("other"), fmt: str = Form("story"),
                   consent: bool = Form(False)):
    limit(request); purge()
    if not consent: raise HTTPException(400, "Please confirm you have permission to edit this image.")
    if fmt not in FORMATS: raise HTTPException(400, "Unsupported output format.")
    prompt = prompt.strip()
    if not 10 <= len(prompt) <= 4000: raise HTTPException(400, "Prompt must be between 10 and 4000 characters.")
    if not os.getenv("OPENAI_API_KEY"): raise HTTPException(500, "Server is missing OPENAI_API_KEY.")
    raw = await image.read()
    if len(raw) > MAX_BYTES: raise HTTPException(413, "Image exceeds the 12 MB limit.")
    try:
        im = Image.open(io.BytesIO(raw)); im.verify()
        im = Image.open(io.BytesIO(raw))
        if im.format not in ("JPEG", "PNG", "WEBP"): raise HTTPException(415, "Use a JPG, PNG or WebP image.")
        im = ImageOps.exif_transpose(im).convert("RGB")
    except HTTPException: raise
    except (UnidentifiedImageError, OSError, SyntaxError):
        raise HTTPException(400, "This file is corrupted or not a valid image.")
    if min(im.size) < 256: raise HTTPException(400, "Image is too small (minimum 256 px on the short side).")
    im.thumbnail((2048, 2048))
    buf = io.BytesIO(); im.save(buf, "PNG"); buf.seek(0)
    size_out, gen_size = FORMATS[fmt]
    full_prompt = f"{PRESERVE}\n\nProduct category: {category}.\n\n{prompt}"
    try:
        client = openai.OpenAI(timeout=120.0, max_retries=1)
        res = client.images.edit(model=MODEL, image=("product.png", buf, "image/png"),
                                 prompt=full_prompt, size=gen_size, quality="medium")
        out = Image.open(io.BytesIO(base64.b64decode(res.data[0].b64_json))).convert("RGB")
    except openai.AuthenticationError: raise HTTPException(502, "Invalid API key on the server.")
    except openai.RateLimitError as e:
        if "insufficient_quota" in str(e): raise HTTPException(402, "The image provider account is out of credits.")
        raise HTTPException(429, "The image provider is rate limiting requests. Try again shortly.")
    except openai.APITimeoutError: raise HTTPException(504, "Generation timed out. Please try again.")
    except openai.BadRequestError as e: raise HTTPException(400, f"The provider rejected the request: {getattr(e, 'message', 'bad request')}")
    except Exception: raise HTTPException(502, "Generation failed. Please try again.")
    final = ImageOps.fit(out, size_out, Image.LANCZOS, centering=(0.5, 0.5))
    pid = uuid.uuid4().hex; d = DATA / pid; d.mkdir()
    im.save(d / "original.png"); final.save(d / "generated.png")
    final.save(d / "generated.jpg", quality=95, subsampling=0)
    meta = {"id": pid, "prompt": prompt, "scene": scene, "category": category, "format": fmt,
            "width": size_out[0], "height": size_out[1], "created_at": int(time.time())}
    (d / "meta.json").write_text(json.dumps(meta))
    return meta

def load(pid: str):
    if not pid.isalnum(): raise HTTPException(404, "Not found")
    f = DATA / pid / "meta.json"
    if not f.exists(): raise HTTPException(404, "Project not found")
    return json.loads(f.read_text())

@app.get("/api/projects")
def projects():
    purge()
    items = [json.loads(f.read_text()) for f in DATA.glob("*/meta.json")]
    return sorted(items, key=lambda m: m["created_at"], reverse=True)

@app.get("/api/projects/{pid}")
def project(pid: str): return load(pid)

@app.get("/api/projects/{pid}/image/{name}")
def project_image(pid: str, name: str):
    load(pid)
    if name not in ("original.png", "generated.png", "generated.jpg"): raise HTTPException(404, "Not found")
    return FileResponse(DATA / pid / name, headers={"Cache-Control": "private, max-age=3600"})

@app.delete("/api/projects/{pid}")
def delete(pid: str):
    load(pid); shutil.rmtree(DATA / pid, ignore_errors=True); return {"deleted": pid}

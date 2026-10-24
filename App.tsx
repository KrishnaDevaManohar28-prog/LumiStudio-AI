import { useEffect, useRef, useState } from "react";

const API = (import.meta.env.VITE_API_URL ?? "") + "/api";
const MAX = 12 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const DEFAULT_PROMPT = "Create a premium commercial product photograph using the uploaded product as the exact visual reference. Place the product in a refined, realistic environment with soft diffused studio lighting, natural contact shadows, subtle depth, accurate perspective, balanced composition, and high-end advertising quality. Preserve the product's original design, shape, colors, texture, logos, labels, patterns, and proportions. Change only the surrounding scene wherever possible. Do not add text, watermarks, or unnecessary objects.";
const SCENES: Record<string, string> = {
  custom: "", white: "Clean white studio, seamless white backdrop, soft even light.",
  beige: "Luxury beige studio with warm neutral tones and soft window light.",
  lavender: "Soft lavender studio backdrop with gentle diffused light.",
  black: "Premium black studio with subtle rim lighting and a glossy dark surface.",
  daylight: "Natural daylight near a window, soft shadows, airy feel.",
  concrete: "Minimalist concrete surface and wall, muted grey tones.",
  marble: "Marble luxury surface with veining, elegant soft reflections.",
  garden: "Garden and outdoor setting, fresh greenery, dappled sunlight.",
  festive: "Festive Indian setting with warm diyas, marigolds and soft golden bokeh.",
  lifestyle: "Modern lifestyle interior, tasteful and uncluttered.",
  cinematic: "Dramatic cinematic lighting with deep shadows and a moody atmosphere.",
};
const CATS = ["Other", "Fashion and clothing", "Sarees and textiles", "Jewelry", "Cosmetics and skincare", "Electronics", "Food and beverages", "Home decor", "Footwear", "Bags and accessories"];
const FORMATS: Record<string, string> = { story: "Instagram Story 9:16 (1080×1920)", portrait: "Instagram Portrait 4:5 (1080×1350)", square: "Square 1:1 (1080×1080)", landscape: "Landscape 16:9 (1920×1080)" };

type Project = { id: string; prompt: string; scene: string; category: string; format: string; width: number; height: number; created_at: number };
const img = (id: string, n: string) => `${API}/projects/${id}/image/${n}`;
const label = "block text-sm font-medium text-slate-300 mb-1.5";
const field = "w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-slate-100";

function Logo() {
  return <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#7775DF" />
    <g stroke="#fff" strokeWidth="1.6" strokeLinecap="round" fill="none">
      <path d="M16 6l5 9M26 12H16M23 23l-5-9M10 26l5-9M6 20h10M9 9l5 9" /></g><circle cx="16" cy="16" r="2.4" fill="#fff" /></svg>;
}

function Compare({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50); const [zoom, setZoom] = useState(1);
  return <div>
    <div className="flex gap-2 mb-2 text-sm">
      <button className="rounded-lg border px-2 py-1 glass" onClick={() => setZoom(z => Math.min(3, z + .25))}>Zoom +</button>
      <button className="rounded-lg border px-2 py-1 glass" onClick={() => setZoom(z => Math.max(.5, z - .25))}>Zoom −</button>
      <button className="rounded-lg border px-2 py-1 glass" onClick={() => setZoom(1)}>Fit</button></div>
    <div className="overflow-auto rounded-2xl border border-white/10 glass max-h-[70vh]">
      <div className="relative mx-auto select-none" style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? 460 : "none" }}>
        <img src={after} alt="Generated" className="block w-full" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <img src={before} alt="Original" className="block w-full h-full object-contain bg-white/5" /></div>
        <div className="absolute top-0 bottom-0 w-0.5 glass shadow" style={{ left: `${pos}%` }} />
        <input type="range" min={0} max={100} value={pos} onChange={e => setPos(+e.target.value)} aria-label="Before and after slider"
          className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize" />
        <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">Original</span>
        <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">AI generated</span></div></div></div>;
}

export default function App() {
  const [tab, setTab] = useState<"studio" | "creations">("studio");
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState(""); const [dims, setDims] = useState("");
  const [scene, setScene] = useState("custom"); const [extra, setExtra] = useState(""); const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [category, setCategory] = useState("Other"); const [fmt, setFmt] = useState("story"); const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [result, setResult] = useState<Project | null>(null);
  const [list, setList] = useState<Project[]>([]); const input = useRef<HTMLInputElement>(null); const [drag, setDrag] = useState(false);

  const loadList = () => fetch(`${API}/projects`).then(r => r.json()).then(setList).catch(() => setErr("Could not load your creations."));
  useEffect(() => { if (tab === "creations") loadList(); }, [tab]);

  function pick(f?: File) {
    setErr(""); if (!f) return;
    if (!TYPES.includes(f.type)) return setErr("Please choose a JPG, PNG or WebP image.");
    if (f.size > MAX) return setErr("That image is larger than 12 MB. Please choose a smaller file.");
    const url = URL.createObjectURL(f); const im = new Image();
    im.onload = () => { setFile(f); setPreview(url); setDims(`${im.naturalWidth} × ${im.naturalHeight} px`); setResult(null); };
    im.onerror = () => { URL.revokeObjectURL(url); setErr("This file looks corrupted and can't be read as an image."); };
    im.src = url;
  }
  function chooseScene(s: string) { setScene(s); if (s !== "custom") setPrompt(`${DEFAULT_PROMPT} Scene: ${SCENES[s]}`); }

  async function generate() {
    if (!file) return setErr("Upload a product photo first.");
    setBusy(true); setErr(""); const steps = ["Uploading securely…", "Analyzing your product…", "Composing the scene…", "Rendering lighting and shadows…", "Finishing touches…"];
    let i = 0; setMsg(steps[0]); const t = setInterval(() => setMsg(steps[Math.min(++i, steps.length - 1)]), 9000);
    const fd = new FormData();
    fd.append("image", file); fd.append("prompt", extra ? `${prompt}\n\nAdditional direction: ${extra}` : prompt);
    fd.append("scene", scene); fd.append("category", category); fd.append("fmt", fmt); fd.append("consent", String(consent));
    try {
      const r = await fetch(`${API}/generate`, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || "Generation failed.");
      setResult(j);
    } catch (e: any) { setErr(e.message || "Network error. Is the backend running?"); }
    finally { clearInterval(t); setBusy(false); }
  }
  async function remove(id: string) {
    if (!confirm("Delete this project and its images permanently?")) return;
    const r = await fetch(`${API}/projects/${id}`, { method: "DELETE" });
    if (!r.ok) return setErr("Delete failed.");
    if (result?.id === id) setResult(null);
    loadList();
  }

  return <div className="min-h-screen md:flex">
    <nav className="md:w-56 glass border-b md:border-r border-white/10 p-4 flex md:flex-col gap-2 items-center md:items-stretch">
      <div className="flex items-center gap-2 mr-4 md:mr-0 md:mb-6"><Logo /><span className="font-head font-extrabold">LumiStudio AI</span></div>
      {(["studio", "creations"] as const).map(t => <button key={t} onClick={() => setTab(t)}
        className={`rounded-xl px-3 py-2 text-left text-sm font-medium ${tab === t ? "bg-brand text-white" : "hover:bg-white/10"}`}>{t === "studio" ? "Studio" : "My Creations"}</button>)}
      <button onClick={() => { setTab("studio"); setFile(null); setPreview(""); setResult(null); }} className="ml-auto md:ml-0 md:mt-4 rounded-xl border border-brand text-brand px-3 py-2 text-sm font-semibold">+ Create New Image</button>
    </nav>
    <main className="flex-1 p-4 md:p-8 max-w-6xl">
      <header className="mb-6"><h1 className="text-2xl font-extrabold">{tab === "studio" ? "Studio" : "My Creations"}</h1>
        <p className="text-slate-400 text-sm">Every product deserves a studio.</p></header>
      {err && <div role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-500/15 text-red-200 px-4 py-3 text-sm">{err}</div>}

      {tab === "studio" ? <div className="grid lg:grid-cols-2 gap-6">
        <section className="space-y-4 rounded-2xl glass border border-white/10 p-5 shadow-sm">
          <div>
            <span className={label}>Product photo (JPG, PNG, WebP · max 12 MB)</span>
            <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
              className={`rounded-xl border-2 border-dashed p-4 text-center ${drag ? "border-brand bg-white/10" : "border-white/25"}`}>
              {preview ? <><img src={preview} alt="Uploaded product" className="mx-auto max-h-48 rounded-lg" />
                <p className="text-xs text-slate-400 mt-2">{file?.name} · {dims}</p>
                <div className="mt-2 flex justify-center gap-2 text-sm">
                  <button className="rounded-lg border px-3 py-1" onClick={() => input.current?.click()}>Replace</button>
                  <button className="rounded-lg border px-3 py-1" onClick={() => { setFile(null); setPreview(""); setResult(null); }}>Clear</button></div></>
                : <><p className="text-sm text-slate-400 mb-2">Drag and drop an image here</p>
                  <button className="rounded-lg bg-brand text-white px-4 py-2 text-sm font-semibold" onClick={() => input.current?.click()}>Browse files</button></>}
              <input ref={input} type="file" accept={TYPES.join(",")} hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} /></div></div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className={label} htmlFor="cat">Product category</label>
              <select id="cat" className={field} value={category} onChange={e => setCategory(e.target.value)}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
            <div><label className={label} htmlFor="fmt">Output format</label>
              <select id="fmt" className={field} value={fmt} onChange={e => setFmt(e.target.value)}>{Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div></div>
          <div><label className={label} htmlFor="scn">Scene template</label>
            <select id="scn" className={field} value={scene} onChange={e => chooseScene(e.target.value)}>
              {Object.keys(SCENES).map(k => <option key={k} value={k}>{k === "custom" ? "Custom scene" : k[0].toUpperCase() + k.slice(1)}</option>)}</select></div>
          <div><label className={label} htmlFor="pr">Scene prompt (fully editable)</label>
            <textarea id="pr" rows={7} className={field} value={prompt} onChange={e => { setPrompt(e.target.value); setScene("custom"); }} /></div>
          <div><label className={label} htmlFor="ex">Extra direction (optional)</label>
            <input id="ex" className={field} placeholder="e.g. warm sunset light, product on a wooden table" value={extra} onChange={e => setExtra(e.target.value)} /></div>
          <p className="text-xs rounded-xl bg-white/5 p-3 text-slate-300">⚠ AI editing may alter fine product details such as logos, labels and small text. Always review the result before publishing. Generated scenes are synthetic and may not represent real locations.</p>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
            I have permission to upload and edit this image.</label>
          <button disabled={busy || !file || !consent} onClick={generate}
            className="w-full rounded-xl bg-brand text-white font-head font-bold py-3 disabled:opacity-50">{busy ? msg : result ? "Regenerate" : "Generate image"}</button>
        </section>

        <section className="rounded-2xl glass border border-white/10 p-5 shadow-sm">
          {result ? <>
            <Compare before={img(result.id, "original.png")} after={img(result.id, "generated.png")} />
            <p className="text-xs text-slate-400 mt-2">{result.width} × {result.height} px · AI-generated, synthetic scene · saved to My Creations</p>
            <div className="flex flex-wrap gap-2 mt-3 text-sm">
              <a className="rounded-xl bg-brand text-white px-4 py-2 font-semibold" href={img(result.id, "generated.png")} download={`lumistudio-${result.id.slice(0, 8)}.png`}>Download PNG</a>
              <a className="rounded-xl border px-4 py-2" href={img(result.id, "generated.jpg")} download={`lumistudio-${result.id.slice(0, 8)}.jpg`}>Download JPEG</a>
              <button className="rounded-xl border px-4 py-2" onClick={() => document.getElementById("pr")?.focus()}>Edit prompt</button>
              <button className="rounded-xl border px-4 py-2 text-red-300" onClick={() => remove(result.id)}>Delete</button></div></>
            : <div className="h-full min-h-[320px] grid place-items-center text-center text-slate-400 text-sm">
              {busy ? <div><div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-white/10 border-t-[#A9A7FF]" />{msg}<br />This can take up to a minute.</div>
                : preview ? <img src={preview} alt="Original preview" className="max-h-[60vh] rounded-xl" /> : "Your preview will appear here."}</div>}
        </section></div>
        : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.length === 0 && <p className="text-sm text-slate-400">No creations yet. Projects are kept privately on the server for the retention period, then deleted automatically.</p>}
          {list.map(p => <article key={p.id} className="rounded-2xl glass border border-white/10 p-3 shadow-sm">
            <img src={img(p.id, "generated.png")} alt="Generated" loading="lazy" className="rounded-xl w-full h-64 object-cover" />
            <p className="text-xs text-slate-400 mt-2">{new Date(p.created_at * 1000).toLocaleString()} · {p.category} · {p.width}×{p.height}</p>
            <p className="text-xs line-clamp-2 mt-1">{p.prompt}</p>
            <div className="flex gap-2 mt-2 text-sm">
              <a className="rounded-lg border px-3 py-1" href={img(p.id, "generated.png")} download>PNG</a>
              <a className="rounded-lg border px-3 py-1" href={img(p.id, "generated.jpg")} download>JPEG</a>
              <button className="rounded-lg border px-3 py-1 text-red-300 ml-auto" onClick={() => remove(p.id)}>Delete</button></div></article>)}
        </div>}
    </main></div>;
}

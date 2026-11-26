import { verifyAccess } from "./access.js";

const RESERVED = new Set(["favicon.ico"]);
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const getFolders = async (env) => JSON.parse((await env.LINKS.get("_folders")) || "[]");
const putFolders = (env, f) => env.LINKS.put("_folders", JSON.stringify(f));
const rand = (n = 6) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
const enc = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
const validTarget = (t) => {
  try { return /^https?:$/.test(new URL(t).protocol); } catch { return false; }
};
const BAD_TARGET = "Enter a valid link starting with http:// or https://";

// ---------------------------------------------------------------------
//  Link records. KV key = slug, value = destination, metadata (max 1 KB):
//    { title, created (ms), folder, target?, exp? (unix s), lock? (password hash) }
//  target is a copy of the value so the list needs no extra reads; it is left out when it would
//  not fit. exp: KV also deletes the key at that time (expiration), and it is kept in the metadata
//  because KV does not return a key's expiration on reads, so edits and moves can keep it.
// ---------------------------------------------------------------------
function meta(md, target) {
  const m = { title: md.title || "", created: md.created || Date.now(), folder: md.folder || "" };
  if (md.exp) m.exp = md.exp;
  if (md.lock) m.lock = md.lock;
  m.target = target;
  if (enc.encode(JSON.stringify(m)).length > 1000) delete m.target;
  return m;
}
async function putLink(env, slug, target, md) {
  const m = meta(md, target), opt = { metadata: m };
  if (m.exp) opt.expiration = Math.max(m.exp, now() + 60); // KV needs at least 60 s ahead
  await env.LINKS.put(slug, target, opt);
  return m;
}
// What the admin page sees (never the password hash)
const pub = (slug, m, target) => ({ slug, title: m.title || "", created: m.created || 0, folder: m.folder || "", target, exp: m.exp || 0, locked: !!m.lock });
const expired = (m) => !!(m && m.exp && m.exp <= now());
// ttl in seconds from now; 0 = never. Max 10 years.
function expFrom(ttl) {
  const s = Math.floor(Number(ttl) || 0);
  if (s < 0 || s > 3650 * 86400) throw new Error("Pick a validity between 1 minute and 10 years, or never.");
  return s ? now() + Math.max(s, 60) : 0;
}
// Every link key (not the "_" records), following KV's 1000-key pages
async function allKeys(env) {
  const out = [];
  let cursor;
  do {
    const r = await env.LINKS.list({ limit: 1000, cursor });
    out.push(...r.keys);
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor);
  return out.filter((k) => !k.name.startsWith("_"));
}

// ---------------------------------------------------------------------
//  Passwords: PBKDF2-SHA256 with a random salt, stored as "p1$<iterations>$<salt>$<hash>".
//  10,000 iterations stays well inside the Free plan's 10 ms CPU per request.
// ---------------------------------------------------------------------
const PW_ITER = 10000;
const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const LOCK_RE = /^p1\$\d{4,6}\$[\w-]+\$[\w-]+$/;
async function pbkdf2(pw, salt, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
}
async function hashPw(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return "p1$" + PW_ITER + "$" + b64u(salt) + "$" + b64u(await pbkdf2(pw, salt, PW_ITER));
}
async function checkPw(pw, lock) {
  if (!LOCK_RE.test(lock || "")) return false;
  const [, it, s, h] = lock.split("$");
  const iter = Math.min(Math.max(Number(it), 1000), 100000);
  const got = await pbkdf2(pw, unb64u(s), iter), want = unb64u(h);
  if (got.length !== want.length) return false;
  let d = 0;
  for (let i = 0; i < got.length; i++) d |= got[i] ^ want[i];
  return d === 0;
}
function checkNewPw(pw) {
  if (pw.length < 4 || pw.length > 128) throw new Error("A password needs 4 to 128 characters.");
}

// ---------------------------------------------------------------------
//  Page title of a pasted link, for the "Link name" field
// ---------------------------------------------------------------------
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decodeEntities = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== "#") return ENT[e.toLowerCase()] ?? m;
    const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    try { return String.fromCodePoint(n); } catch { return m; }
  });
function pageTitle(html) {
  const metaTag = (name) => {
    for (const t of html.match(/<meta\b[^>]*>/gi) || []) {
      if (!new RegExp("(?:property|name)\\s*=\\s*[\"']" + name + "[\"']", "i").test(t)) continue;
      const c = t.match(/content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i);
      if (c) return c[1] ?? c[2];
    }
    return "";
  };
  const t = metaTag("og:title") || metaTag("twitter:title") || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  return decodeEntities(t).replace(/\s+/g, " ").trim().slice(0, 80);
}
async function fetchTitle(u) {
  const r = await fetch(u, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; bunnxr-links/1.0)", accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok || !r.body || !/html/i.test(r.headers.get("content-type") || "")) return "";
  const reader = r.body.getReader(), dec = new TextDecoder();
  let html = "";
  while (html.length < 150000) { // the title is in <head>; stop reading there
    const { value, done } = await reader.read();
    if (done) break;
    html += dec.decode(value, { stream: true });
    if (/<\/head>/i.test(html)) break;
  }
  reader.cancel().catch(() => {});
  return pageTitle(html);
}

// ---------------------------------------------------------------------
//  R2 files folder: passes these calls on to the r2-files Worker through the FILES
//  service binding. Nothing is copied: r2-files owns the file links, this only shows
//  and edits them. r2-files checks a shared token, kept here in KV under
//  "_r2files_token" (names starting with "_" are never short links), which r2-files
//  reads through its own binding to this namespace. It is created on first use.
// ---------------------------------------------------------------------
const R2_ROUTES = new Set(["GET config", "GET links", "GET list", "POST link-add", "POST link-update", "POST link-delete"]);
async function r2Token(env) {
  let t = await env.LINKS.get("_r2files_token");
  if (!t) {
    t = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
    await env.LINKS.put("_r2files_token", t);
  }
  return t;
}
async function r2(request, env, url) {
  if (!env.FILES) return json({ error: "The FILES service binding to r2-files is missing." }, 500);
  const route = url.pathname.slice("/_api/r2/".length);
  if (!R2_ROUTES.has(request.method + " " + route)) return json({ error: "Not found" }, 404);
  const init = { method: request.method, headers: { "x-internal-token": await r2Token(env) } };
  if (request.method === "POST") { init.body = await request.text(); init.headers["content-type"] = "application/json"; }
  const res = await env.FILES.fetch(new Request("https://r2-files.internal/" + route + url.search, init));
  return new Response(res.body, { status: res.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

async function api(request, env, url) {
  if (!(await verifyAccess(request, env))) return json({ error: "Unauthorized" }, 401);
  try {
    return await route(request, env, url);
  } catch (e) {
    return json({ error: e && e.message ? e.message : "Something went wrong" }, 400);
  }
}

async function route(request, env, url) {
  const p = url.pathname, m = request.method;

  if (p === "/_api/config" && m === "GET") return json({ host: env.SHORT_HOST || url.host, r2: !!env.FILES });

  // "R2 files" folder: file links that live in the r2-files Worker, managed from here.
  if (p.startsWith("/_api/r2/")) return r2(request, env, url);

  // The title of a page, to name a new link. Empty when it cannot be read.
  if (p === "/_api/title" && m === "GET") {
    const u = url.searchParams.get("url") || "";
    if (!validTarget(u)) return json({ title: "" });
    try { return json({ title: await fetchTitle(u) }); } catch { return json({ title: "" }); }
  }

  // { target, title?, slug?, folder?, ttl? (seconds, 0 = never), password? }
  if (p === "/_api/add" && m === "POST") {
    const b = await request.json().catch(() => ({}));
    const target = String(b.target || "").trim();
    if (!validTarget(target)) return json({ error: BAD_TARGET }, 400);
    const slug = String(b.slug || "").trim().toLowerCase() || rand();
    if (!SLUG_RE.test(slug)) return json({ error: "Back-half: letters, numbers, - and _ only" }, 400);
    if (RESERVED.has(slug)) return json({ error: "That back-half is reserved" }, 400);
    if ((await env.LINKS.get(slug)) !== null) return json({ error: "That back-half is already taken" }, 409);
    const folder = String(b.folder || "");
    if (folder && !(await getFolders(env)).includes(folder)) return json({ error: "Folder not found" }, 400);
    const pw = String(b.password || "");
    if (pw) checkNewPw(pw);
    const md = await putLink(env, slug, target, { title: String(b.title || "").trim().slice(0, 80), created: Date.now(), folder, exp: expFrom(b.ttl), lock: pw ? await hashPw(pw) : "" });
    return json({ ok: true, slug, link: pub(slug, md, target), short: "https://" + (env.SHORT_HOST || url.host) + "/" + slug });
  }

  if (p === "/_api/list" && m === "GET") {
    const keys = await allKeys(env);
    const links = await Promise.all(
      keys.filter((k) => !expired(k.metadata)).map(async (k) => {
        const md = k.metadata || {};
        return pub(k.name, md, md.target || (await env.LINKS.get(k.name)));
      })
    );
    links.sort((a, b) => b.created - a.created);
    return json({ links: links.filter((l) => l.target !== null), folders: await getFolders(env) });
  }

  if (p === "/_api/folder" && m === "POST") {
    const name = String((await request.json().catch(() => ({}))).name || "").trim().slice(0, 40);
    if (!name) return json({ error: "Enter a folder name" }, 400);
    const f = await getFolders(env);
    if (f.some((x) => x.toLowerCase() === name.toLowerCase())) return json({ error: "That folder already exists" }, 409);
    await putFolders(env, [...f, name]);
    return json({ ok: true, name });
  }

  if (p === "/_api/folder" && m === "DELETE") {
    const name = url.searchParams.get("name") || "";
    if ((await allKeys(env)).some((k) => k.metadata && k.metadata.folder === name && !expired(k.metadata))) return json({ error: "Move or delete the links inside first" }, 409);
    await putFolders(env, (await getFolders(env)).filter((x) => x !== name));
    return json({ ok: true });
  }

  if (p === "/_api/move" && m === "POST") {
    const b = await request.json().catch(() => ({}));
    const slug = String(b.slug || ""), folder = String(b.folder || "");
    if (folder && !(await getFolders(env)).includes(folder)) return json({ error: "Folder not found" }, 404);
    const { value, metadata } = await env.LINKS.getWithMetadata(slug);
    if (value === null || slug.startsWith("_")) return json({ error: "Link not found" }, 404);
    await putLink(env, slug, value, { ...(metadata || {}), folder }); // keeps exp and password
    return json({ ok: true });
  }

  // Edit a link: { slug, target?, title?, newSlug?, ttl?, password?, removePassword? }
  //   ttl: left out = keep the expiry, 0 = never expires, n = n seconds from now
  //   password: a new password; removePassword: true = open to everyone again
  // A new address moves the link (the old one stops working); created time and folder are kept.
  if (p === "/_api/edit" && m === "POST") {
    const b = await request.json().catch(() => ({}));
    const slug = String(b.slug || "");
    const { value, metadata } = await env.LINKS.getWithMetadata(slug);
    if (!slug || slug.startsWith("_") || value === null) return json({ error: "This link no longer exists" }, 404);
    let target = value;
    if (b.target !== undefined) {
      target = String(b.target).trim();
      if (!validTarget(target)) return json({ error: BAD_TARGET }, 400);
    }
    let to = slug;
    if (b.newSlug !== undefined && String(b.newSlug).trim().toLowerCase() !== slug) {
      to = String(b.newSlug).trim().toLowerCase();
      if (!SLUG_RE.test(to)) return json({ error: "Back-half: letters, numbers, - and _ only" }, 400);
      if (RESERVED.has(to)) return json({ error: "That back-half is reserved" }, 400);
      if ((await env.LINKS.get(to)) !== null) return json({ error: "That back-half is already taken" }, 409);
    }
    const md = { ...(metadata || {}) };
    if (b.title !== undefined) md.title = String(b.title).trim().slice(0, 80);
    if (b.ttl !== undefined && b.ttl !== null && b.ttl !== "") md.exp = expFrom(b.ttl);
    if (b.removePassword) md.lock = "";
    const pw = String(b.password || "");
    if (pw) { checkNewPw(pw); md.lock = await hashPw(pw); }
    const saved = await putLink(env, to, target, md);
    if (to !== slug) await env.LINKS.delete(slug);
    return json({ ok: true, link: pub(to, saved, target), short: "https://" + (env.SHORT_HOST || url.host) + "/" + to });
  }

  if (p === "/_api/delete" && m === "DELETE") {
    const slug = url.searchParams.get("slug");
    if (!slug || slug.startsWith("_")) return json({ error: "Missing slug" }, 400);
    await env.LINKS.delete(slug);
    return json({ ok: true });
  }

  // Backup: every link (with its expiry and password hash, so a restore keeps them) and folder.
  if (p === "/_api/export" && m === "GET") {
    const keys = (await allKeys(env)).filter((k) => !expired(k.metadata));
    const links = await Promise.all(keys.map(async (k) => {
      const md = k.metadata || {};
      const target = md.target || (await env.LINKS.get(k.name));
      if (target === null) return null;
      return { slug: k.name, target, title: md.title || "", folder: md.folder || "", created: md.created || 0, exp: md.exp || 0, password_hash: md.lock || "" };
    }));
    return json({ app: "bunnxr-links", version: 1, exported: Date.now(), folders: await getFolders(env), links: links.filter(Boolean) });
  }

  // Restore: { links: [{ slug?, target, title?, folder?, created?, exp?, password_hash? }], folders? }
  // Up to 100 links per call. Addresses that already exist are skipped, never overwritten.
  // An empty slug gets a random one. Missing folders are created.
  if (p === "/_api/import" && m === "POST") {
    const b = await request.json().catch(() => ({}));
    const items = Array.isArray(b.links) ? b.links.slice(0, 100) : [];
    const folders = await getFolders(env), byLower = new Map(folders.map((f) => [f.toLowerCase(), f])), newFolders = [];
    const folderOf = (raw) => {
      const f = String(raw || "").trim().slice(0, 40);
      if (!f) return "";
      if (!byLower.has(f.toLowerCase())) { byLower.set(f.toLowerCase(), f); newFolders.push(f); }
      return byLower.get(f.toLowerCase());
    };
    (Array.isArray(b.folders) ? b.folders : []).forEach(folderOf);
    const added = [];
    let skipped = 0, invalid = 0;
    for (const it of items) {
      const target = String((it && it.target) || "").trim();
      let slug = String((it && it.slug) || "").trim().toLowerCase();
      if (!validTarget(target) || (slug && (!SLUG_RE.test(slug) || RESERVED.has(slug)))) { invalid++; continue; }
      if (!slug) { do slug = rand(); while ((await env.LINKS.get(slug)) !== null); }
      else if ((await env.LINKS.get(slug)) !== null) { skipped++; continue; }
      const exp = Math.floor(Number(it.exp) || 0);
      if (exp && exp <= now() + 60) { skipped++; continue; } // already expired
      const lock = typeof it.password_hash === "string" && LOCK_RE.test(it.password_hash) ? it.password_hash : "";
      const md = await putLink(env, slug, target, { title: String(it.title || "").trim().slice(0, 80), created: Number(it.created) || Date.now(), folder: folderOf(it.folder), exp, lock });
      added.push(pub(slug, md, target));
    }
    if (newFolders.length) await putFolders(env, [...folders, ...newFolders]);
    return json({ added, skipped, invalid, folders: newFolders });
  }

  return json({ error: "Not found" }, 404);
}

// ---------------------------------------------------------------------
//  Redirects (bunnxr.com)
// ---------------------------------------------------------------------
// /slug, /slug?x=1 and /slug/extra/path all resolve to the stored link.
function destination(stored, rest, search) {
  try {
    const t = new URL(stored);
    rest = (rest || "").replace(/^\/+$/, "");
    if (rest) t.pathname = t.pathname.replace(/\/$/, "") + rest; // append extra path
    if (search) t.search = t.search ? t.search + "&" + search.slice(1) : search; // keep extra query
    return t.href;
  } catch {
    return stored;
  }
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// The page a password-protected link shows. It posts back to the same address.
function lockPage(url, wrong) {
  const where = esc(url.host + url.pathname);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Protected link</title>
<style>:root{color-scheme:dark;--bg:#000;--fg:#fff;--mute:#a3a3a3;--line:#333;--acc:#4fd1bf;--bad:#ff6b61}@media(prefers-color-scheme:light){:root{color-scheme:light;--bg:#fbf8f3;--fg:#1c1f1d;--mute:#6f726c;--line:#e2dfd7;--acc:#0f766e;--bad:#b3261e}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--fg);font:15px/1.5 ui-monospace,"Roboto Mono",Consolas,monospace}
form{width:min(360px,100%);display:flex;flex-direction:column;gap:14px}svg{color:var(--acc)}h1{margin:0;font-size:1.3rem}p{margin:0;color:var(--mute);font-size:.85rem;word-break:break-all}
input{width:100%;padding:11px 2px;border:0;border-bottom:2px solid var(--fg);background:transparent;color:inherit;font:inherit;font-size:16px}input:focus{outline:0;border-color:var(--acc)}
button{padding:12px;border:0;border-radius:4px;background:var(--fg);color:var(--bg);font:inherit;font-weight:600;cursor:pointer}button:hover{background:var(--acc)}.bad{color:var(--bad)}</style></head>
<body><form method="post"><svg viewBox="0 0 40 40" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M15 24C9 14 11 3 16 4C20 5 19 15 19 24"/><path d="M25 24C31 14 29 3 24 4C20 5 21 15 21 24"/><rect x="9" y="24" width="22" height="11" rx="5.5"/></svg>
<h1>This link is protected</h1><p>${where}</p>${wrong ? '<p class="bad">Wrong password. Try again.</p>' : ""}
<input name="pw" type="password" placeholder="Password" autocomplete="current-password" required autofocus><button>Open link</button></form></body></html>`;
  return new Response(html, { status: wrong ? 401 : 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Admin host: Access-protected UI (static assets) + API. Nothing else is exposed here.
    if (url.hostname === env.ADMIN_HOST) {
      if (url.pathname.startsWith("/_api/")) return api(request, env, url);
      return env.ASSETS.fetch(request);
    }

    // Every other host (bunnxr.com): redirects only. No UI, no API.
    const m = url.pathname.slice(1).match(/^([^/]+)(\/.*)?$/);
    const slug = m ? m[1].toLowerCase() : "";
    if (slug && !slug.startsWith("_")) {
      const { value: stored, metadata } = await env.LINKS.getWithMetadata(slug);
      if (stored && !expired(metadata)) {
        const dest = destination(stored, m[2], url.search);
        if (metadata && metadata.lock) {
          if (request.method === "POST") {
            const form = await request.formData().catch(() => null);
            const pw = form ? String(form.get("pw") || "") : "";
            if (pw && (await checkPw(pw, metadata.lock))) return new Response(null, { status: 303, headers: { Location: dest, "cache-control": "no-store" } });
            return lockPage(url, true);
          }
          if (request.method === "GET" || request.method === "HEAD") return lockPage(url, false);
          return new Response("Method not allowed", { status: 405 });
        }
        return new Response(null, { status: 302, headers: { Location: dest } });
      }
    }
    // Not a short link of ours: let the r2-files Worker try it as a file link (bunnxr.com/gta6.mp4).
    // FILES is a service binding (wrangler.toml), so this stays inside Cloudflare and the request,
    // including Range headers for video seeking, is passed on unchanged.
    if (env.FILES && m && !m[2] && (request.method === "GET" || request.method === "HEAD")) return env.FILES.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};

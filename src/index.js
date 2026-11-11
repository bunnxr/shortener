import { verifyAccess } from "./access.js";

const RESERVED = new Set(["favicon.ico"]);
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const rand = (n = 6) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");

async function api(request, env, url) {
  if (!(await verifyAccess(request, env))) return json({ error: "Unauthorized" }, 401);
  const p = url.pathname, m = request.method;

  if (p === "/_api/config" && m === "GET") return json({ host: env.SHORT_HOST || url.host });

  if (p === "/_api/add" && m === "POST") {
    const b = await request.json().catch(() => ({}));
    const target = String(b.target || "").trim();
    try {
      if (!/^https?:$/.test(new URL(target).protocol)) throw 0;
    } catch {
      return json({ error: "Enter a valid link starting with http:// or https://" }, 400);
    }
    const slug = String(b.slug || "").trim().toLowerCase() || rand();
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug)) return json({ error: "Slug: letters, numbers, - and _ only" }, 400);
    if (RESERVED.has(slug)) return json({ error: "That slug is reserved" }, 400);
    if ((await env.LINKS.get(slug)) !== null) return json({ error: "That slug is already taken" }, 409);
    const meta = { title: String(b.title || "").trim().slice(0, 80), created: Date.now() };
    if (target.length < 700) meta.target = target; // KV metadata is capped at 1 KB
    await env.LINKS.put(slug, target, { metadata: meta });
    return json({ ok: true, slug, short: "https://" + (env.SHORT_HOST || url.host) + "/" + slug });
  }

  if (p === "/_api/list" && m === "GET") {
    const { keys } = await env.LINKS.list({ limit: 1000 });
    const links = await Promise.all(
      keys.map(async (k) => {
        const md = k.metadata || {};
        return { slug: k.name, title: md.title || "", created: md.created || 0, target: md.target || (await env.LINKS.get(k.name)) };
      })
    );
    links.sort((a, b) => b.created - a.created);
    return json(links);
  }

  if (p === "/_api/delete" && m === "DELETE") {
    const slug = url.searchParams.get("slug");
    if (!slug) return json({ error: "Missing slug" }, 400);
    await env.LINKS.delete(slug);
    return json({ ok: true });
  }
  return json({ error: "Not found" }, 404);
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
    const slug = url.pathname.slice(1).toLowerCase();
    if (slug) {
      const target = await env.LINKS.get(slug);
      if (target) return Response.redirect(target, 302);
    }
    return new Response("Not found", { status: 404 });
  },
};

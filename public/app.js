const $ = (s) => document.querySelector(s);
let tab = "link", HOST = location.host, cur = "", data = { links: [], folders: [] };
$("#host").textContent = HOST + "/";
const FOLDER = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
const msg = (t, ok) => { const m = $("#msg"); m.textContent = t; m.className = ok ? "ok" : "err"; };
const shortUrl = (slug) => "https://" + HOST + "/" + slug;

async function api(path, opt) {
  const r = await fetch("/_api/" + path, opt);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Something went wrong (" + r.status + ")");
  return d;
}
const post = (path, body) => api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// KV listings can lag by up to a minute, so recent changes are remembered briefly and merged in.
const TTL = 120000;
function recent() {
  try { return JSON.parse(sessionStorage.getItem("recent") || "[]").filter((x) => Date.now() - x.t < TTL); } catch { return []; }
}
function merge(d) {
  let L = d.links, F = d.folders;
  for (const { type, v } of recent()) {
    if (type === "add" && !L.some((x) => x.slug === v.slug)) L = [v, ...L];
    if (type === "del") L = L.filter((x) => x.slug !== v);
    if (type === "move") L = L.map((x) => (x.slug === v.slug ? { ...x, folder: v.folder } : x));
    if (type === "fadd" && !F.includes(v)) F = [...F, v];
    if (type === "fdel") F = F.filter((x) => x !== v);
  }
  return { links: [...L].sort((a, b) => b.created - a.created), folders: [...F].sort((a, b) => a.localeCompare(b)) };
}
function commit(type, v) {
  try { sessionStorage.setItem("recent", JSON.stringify([...recent(), { type, v, t: Date.now() }])); } catch {}
  data = merge(data);
  render();
}
async function load() {
  try { data = merge(await api("list")); render(); } catch (e) { msg(e.message, false); }
}
function open(name) { cur = name; $("#q").value = ""; render(); $("#folder").value = cur; }

document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => {
  tab = b.dataset.tab;
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x === b));
  const qr = tab === "qr";
  $("#title").textContent = qr ? "Generate a QR code" : "Shorten a long link";
  $("#go").textContent = qr ? "Generate QR" : "Shorten URL";
  $("#opts").hidden = qr;
  msg("");
}));

$("#go").onclick = async () => {
  const target = $("#url").value.trim();
  if (!target) return msg("Paste a link first", false);
  if (tab === "qr") return showQR(target, target);
  try {
    const d = await post("add", { target, title: $("#name").value, slug: $("#slug").value, folder: $("#folder").value });
    navigator.clipboard?.writeText(d.short).catch(() => {});
    msg("Created and copied: " + d.short + (d.link.folder ? " (in " + d.link.folder + ")" : ""), true);
    ["#url", "#name", "#slug"].forEach((s) => ($(s).value = ""));
    commit("add", d.link);
  } catch (e) { msg(e.message, false); }
};
$("#url").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#go").click(); });
$("#q").oninput = render;

$("#nf").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("#nfn").value.trim();
  if (!name) return;
  try { const d = await post("folder", { name }); $("#nfn").value = ""; commit("fadd", d.name); } catch (err) { msg(err.message, false); }
};

function icon(l) {
  const box = el("div", "ico"), letter = (l.title || l.slug)[0].toUpperCase();
  try {
    const img = el("img");
    img.alt = "";
    img.src = "https://www.google.com/s2/favicons?sz=64&domain=" + new URL(l.target).hostname;
    img.onerror = () => { img.remove(); box.textContent = letter; };
    box.append(img);
  } catch { box.textContent = letter; }
  return box;
}

function dest(target) {
  const d = el("div", "dest");
  d.append("↳ ");
  if (/^https?:\/\//i.test(target)) {
    const a = el("a", "", target);
    a.href = target; a.target = "_blank"; a.rel = "noopener noreferrer"; a.title = target;
    d.append(a);
  } else d.append(target);
  return d;
}

async function moveTo(l, folder) {
  try { await post("move", { slug: l.slug, folder }); commit("move", { slug: l.slug, folder }); } catch (e) { msg(e.message, false); }
}

function render() {
  const { links, folders } = data, q = $("#q").value.toLowerCase();
  if (cur && !folders.includes(cur)) cur = "";

  // creator's folder picker
  const fs = $("#folder"), keep = fs.value;
  fs.textContent = "";
  fs.append(new Option("Home (no folder)", ""));
  folders.forEach((f) => fs.append(new Option(f, f)));
  fs.value = folders.includes(keep) ? keep : cur;

  // breadcrumbs
  const cr = $("#crumbs");
  cr.textContent = "";
  const home = el("button", "crumb" + (cur ? "" : " here"), "Home");
  home.onclick = () => open("");
  cr.append(home);
  if (cur) {
    const del = el("button", "ghost small", "Delete folder");
    del.onclick = async () => {
      if (!confirm("Delete the folder " + cur + "?")) return;
      try { await api("folder?name=" + encodeURIComponent(cur), { method: "DELETE" }); const gone = cur; commit("fdel", gone); } catch (e) { msg(e.message, false); }
    };
    cr.append(el("span", "sep", "/"), el("span", "crumb here", cur), del);
  }

  $("#nf").hidden = !!cur;

  // folder tiles (home only)
  const fb = $("#folders");
  fb.textContent = "";
  fb.hidden = !!cur || !!q || !folders.length;
  folders.forEach((f) => {
    const n = links.filter((l) => l.folder === f).length, b = el("button", "folder");
    b.innerHTML = FOLDER;
    b.append(el("span", "fname", f), el("small", "", n + (n === 1 ? " link" : " links")));
    b.onclick = () => open(f);
    fb.append(b);
  });

  // links
  const rows = links.filter((l) => (q ? (l.slug + " " + l.title + " " + l.target + " " + l.folder).toLowerCase().includes(q) : l.folder === cur));
  const box = $("#list");
  box.textContent = "";
  if (!rows.length) box.append(el("div", "empty", q ? "No links match your search." : cur ? "This folder is empty. Pick it as the folder when you create a link." : "No loose links here. Paste one on the left."));
  rows.forEach((l) => {
    const item = el("div", "item"), body = el("div", "body"), acts = el("div", "acts");
    const a = el("a", "", HOST + "/" + l.slug);
    a.href = shortUrl(l.slug); a.target = "_blank"; a.rel = "noopener";
    body.append(el("h3", "", l.title || "/" + l.slug), a, dest(l.target));
    const when = l.created ? new Date(l.created).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
    const meta = [when, q && l.folder ? "in " + l.folder : ""].filter(Boolean).join("  ");
    if (meta) body.append(el("div", "meta", meta));
    const copy = el("button", "", "Copy");
    copy.onclick = () => navigator.clipboard.writeText(shortUrl(l.slug)).then(() => { copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy"), 1200); });
    const qr = el("button", "", "QR");
    qr.onclick = () => showQR(shortUrl(l.slug), l.title || HOST + "/" + l.slug);
    const del = el("button", "del", "Delete");
    del.onclick = async () => {
      if (!confirm("Delete " + HOST + "/" + l.slug + "?")) return;
      try { await api("delete?slug=" + encodeURIComponent(l.slug), { method: "DELETE" }); commit("del", l.slug); } catch (e) { msg(e.message, false); }
    };
    acts.append(copy, qr, del);
    if (l.folder || folders.length) {
      const mv = el("select", "mv");
      mv.setAttribute("aria-label", "Move to folder");
      mv.append(new Option("Move to…", "", true, true));
      mv.options[0].disabled = true;
      if (l.folder) mv.append(new Option("Home", "__home"));
      folders.filter((f) => f !== l.folder).forEach((f) => mv.append(new Option(f, f)));
      mv.onchange = () => moveTo(l, mv.value === "__home" ? "" : mv.value);
      acts.append(mv);
    }
    item.append(icon(l), body, acts);
    box.append(item);
  });
}

function showQR(text, label) {
  const box = $("#qrbox");
  box.textContent = "";
  new QRCode(box, { text, width: 240, height: 240, correctLevel: QRCode.CorrectLevel.M });
  $("#qrlabel").textContent = label;
  $("#qrd").showModal();
}
$("#qrdl").onclick = () => {
  const src = $("#qrbox canvas") || $("#qrbox img");
  const c = document.createElement("canvas");
  c.width = c.height = 272; // 16px white quiet zone so phones scan it reliably
  const x = c.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, 272, 272); x.drawImage(src, 16, 16, 240, 240);
  const a = document.createElement("a");
  a.href = c.toDataURL("image/png"); a.download = "qr.png"; a.click();
};
$("#qrx").onclick = () => $("#qrd").close();

api("config").then((c) => { HOST = c.host; $("#host").textContent = HOST + "/"; }).catch(() => {}).then(load);

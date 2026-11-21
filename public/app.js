const $ = (s) => document.querySelector(s);
let tab = "link", HOST = location.host, cur = "", data = { links: [], folders: [] };
$("#host").textContent = HOST + "/";
const FOLDER = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';

// R2 files folder (file links owned by the r2-files Worker)
const R2ID = "\u0001r2"; // folder id that can never clash with a real folder name
const R2 = { on: false, links: [], loading: false, error: "", seq: 0 };
const CLOUD = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>';
// Files a browser can open by itself (same list as VIEW_MIME in r2-files/src/util.js)
const VIEW_EXT = " pdf jpg jpeg png gif webp avif svg bmp ico mp4 m4v webm mov ogv mp3 m4a aac wav ogg opus flac txt md log csv srt vtt json xml html htm ";
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
function open(name) { cur = name; $("#q").value = ""; render(); $("#folder").value = cur === R2ID ? "" : cur; }

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

// ---------------------------------------------------------------------
//  R2 files: a live folder of the file links owned by the r2-files Worker.
//  Nothing is stored here; every list and change goes to r2-files (/_api/r2/…).
// ---------------------------------------------------------------------
async function loadR2() {
  const seq = ++R2.seq;
  R2.loading = true; R2.error = ""; render();
  const all = [];
  try {
    let after = "", pages = 0;
    do { // r2-files answers 20 links per call
      const d = await api("r2/links?after=" + encodeURIComponent(after));
      if (seq !== R2.seq) return;
      all.push(...d.links);
      after = d.next;
      R2.links = all.slice(); render();
    } while (after && ++pages < 100);
  } catch (e) { if (seq === R2.seq) R2.error = e.message; }
  if (seq !== R2.seq) return;
  R2.links = all.sort((a, b) => (b.t || 0) - (a.t || 0)); R2.loading = false; render();
}
const r2Url = (l) => l.url || "https://" + HOST + "/" + encodeURIComponent(l.name);
const canView = (n) => { const i = n.lastIndexOf("."); return i > 0 && VIEW_EXT.includes(" " + n.slice(i + 1).toLowerCase() + " "); };
const fmtSize = (n) => { const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0; while (n >= 1024 && i < 4) { n /= 1024; i++; } return (i ? n.toFixed(1) : n) + " " + u[i]; };
function inWords(s) { s = Math.abs(s); if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min"; if (s < 86400) return Math.round(s / 3600) + " h"; const d = Math.round(s / 86400); return d + (d === 1 ? " day" : " days"); }
function validity(l) {
  if (l.missing) return "file missing";
  if (!l.exp) return "never expires";
  const d = l.exp - Date.now() / 1000;
  return d > 0 ? "expires in " + inWords(d) : "expired";
}
async function r2Update(l, body, ok) {
  try {
    const r = await post("r2/link-update", Object.assign({ name: l.name }, body));
    Object.assign(l, r);
    render(); msg(ok, true);
  } catch (e) { msg(e.message, false); }
}
function r2Item(l, showWhere) {
  const item = el("div", "item r2" + (l.missing ? " broken" : "")), body = el("div", "body"), acts = el("div", "acts");
  const file = l.key ? l.key.split("/").pop() : l.name;
  const ext = file.includes(".") ? file.split(".").pop().slice(0, 4).toUpperCase() : "FILE";
  const ico = el("div", "ico ext", ext);
  const a = el("a", "", r2Url(l).replace(/^https?:\/\//, ""));
  a.href = r2Url(l); a.target = "_blank"; a.rel = "noopener";
  body.append(el("h3", "", file), a, dest(l.key ? "R2: " + l.key + (l.size ? " · " + fmtSize(l.size) : "") : "R2: no file"));
  const tags = [validity(l), l.mode === "view" ? "opens in browser" : l.mode === "download" ? "downloads" : "", showWhere ? "in R2 files" : ""].filter(Boolean);
  const meta = el("div", "meta" + (l.missing ? " bad" : ""), tags.join("  ·  "));
  if (l.exp) meta.title = new Date(l.exp * 1000).toLocaleString();
  body.append(meta);

  const copy = el("button", "", "Copy");
  copy.onclick = () => navigator.clipboard.writeText(r2Url(l)).then(() => { copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy"), 1200); });
  const qr = el("button", "", "QR");
  qr.onclick = () => showQR(r2Url(l), file);
  const ren = el("button", "", "Rename");
  ren.onclick = async () => {
    const v = prompt("New address. The old one stops working.\n" + HOST + "/", l.name);
    if (!v || v.trim() === l.name) return;
    await r2Update(l, { newName: v.trim() }, "Address changed.");
  };
  const del = el("button", "del", "Delete");
  del.onclick = async () => {
    if (!confirm("Delete " + r2Url(l).replace(/^https?:\/\//, "") + "?\nThe file itself stays in R2.")) return;
    try { await post("r2/link-delete", { name: l.name }); R2.links = R2.links.filter((x) => x !== l); render(); msg("Link deleted.", true); } catch (e) { msg(e.message, false); }
  };
  acts.append(copy, qr, ren, del);

  const va = el("select", "mv");
  va.setAttribute("aria-label", "Change validity");
  va.append(new Option("Validity…", "", true, true));
  va.options[0].disabled = true;
  [[3600, "1 hour"], [86400, "1 day"], [604800, "7 days"], [2592000, "30 days"], [7776000, "90 days"], [0, "Never expires"]].forEach(([s, t]) => va.append(new Option(t, String(s))));
  va.onchange = () => { const s = +va.value; r2Update(l, { exp: s ? Math.floor(Date.now() / 1000) + s : 0 }, "Validity updated."); };
  acts.append(va);
  if (l.key && canView(l.key)) {
    const ty = el("select", "mv");
    ty.setAttribute("aria-label", "Link type");
    ty.append(new Option("Type…", "", true, true));
    ty.options[0].disabled = true;
    if (l.mode !== "view") ty.append(new Option("Open in browser", "view"));
    if (l.mode !== "download") ty.append(new Option("Download", "download"));
    ty.onchange = () => r2Update(l, { mode: ty.value }, ty.value === "view" ? "The link now opens in the browser." : "The link now downloads the file.");
    acts.append(ty);
  }
  item.append(ico, body, acts);
  return item;
}

// New file link: browse the bucket, pick a file, then address, type and validity.
const R2D = { dir: "", key: "" };
async function r2Browse(dir) {
  R2D.dir = dir;
  const cr = $("#r2crumbs");
  cr.textContent = "";
  const top = el("button", "crumb" + (dir ? "" : " here"), "bucket");
  top.onclick = () => r2Browse("");
  cr.append(top);
  let acc = "";
  dir.split("/").filter(Boolean).forEach((p, i, arr) => {
    acc += p + "/";
    const to = acc, b = el("button", "crumb" + (i === arr.length - 1 ? " here" : ""), p);
    b.onclick = () => r2Browse(to);
    cr.append(el("span", "sep", "/"), b);
  });
  const box = $("#r2files");
  box.textContent = "";
  box.append(el("div", "empty", "Loading…"));
  try {
    const d = await api("r2/list?prefix=" + encodeURIComponent(dir));
    if (R2D.dir !== dir) return;
    box.textContent = "";
    d.folders.forEach((f) => { const b = el("button", "r2row dir"); b.innerHTML = FOLDER; b.append(el("span", "", f.slice(dir.length).replace(/\/$/, ""))); b.onclick = () => r2Browse(f); box.append(b); });
    d.files.forEach((f) => { const b = el("button", "r2row"); b.append(el("span", "", f.key.slice(dir.length)), el("small", "", fmtSize(f.size))); b.onclick = () => r2Pick(f.key); box.append(b); });
    if (!d.folders.length && !d.files.length) box.append(el("div", "empty", "This folder is empty."));
  } catch (e) { box.textContent = ""; box.append(el("div", "empty", e.message)); }
}
function r2Pick(key) {
  R2D.key = key;
  $("#r2file").textContent = key;
  $("#r2pick").hidden = true; $("#r2form").hidden = false; $("#r2create").hidden = false;
  $("#r2typel").hidden = !canView(key);
  $("#r2type").value = "view"; $("#r2name").value = ""; $("#r2msg").textContent = ""; $("#r2msg").className = "r2msg";
  $("#r2name").focus();
}
function r2Create() {
  $("#r2host").textContent = HOST + "/";
  $("#r2pick").hidden = false; $("#r2form").hidden = true; $("#r2create").hidden = true;
  $("#r2d").showModal();
  r2Browse(R2D.dir);
}
$("#r2change").onclick = () => { $("#r2pick").hidden = false; $("#r2form").hidden = true; $("#r2create").hidden = true; r2Browse(R2D.dir); };
$("#r2x").onclick = () => $("#r2d").close();
$("#r2create").onclick = async () => {
  const s = +$("#r2valid").value, m = $("#r2msg");
  try {
    const r = await post("r2/link-add", { key: R2D.key, name: $("#r2name").value.trim(), exp: s ? Math.floor(Date.now() / 1000) + s : 0, mode: canView(R2D.key) ? $("#r2type").value : "" });
    R2.links = [r, ...R2.links.filter((x) => x.name !== r.name)];
    render();
    navigator.clipboard?.writeText(r.url).catch(() => {});
    m.textContent = "Created and copied: " + r.url; m.className = "r2msg ok";
    $("#r2name").value = "";
  } catch (e) { m.textContent = e.message; m.className = "r2msg err"; }
};

async function moveTo(l, folder) {
  try { await post("move", { slug: l.slug, folder }); commit("move", { slug: l.slug, folder }); } catch (e) { msg(e.message, false); }
}

function render() {
  const { links, folders } = data, q = $("#q").value.toLowerCase();
  if (cur && cur !== R2ID && !folders.includes(cur)) cur = "";
  if (cur === R2ID && !R2.on) cur = "";
  const inR2 = cur === R2ID;

  // creator's folder picker
  const fs = $("#folder"), keep = fs.value;
  fs.textContent = "";
  fs.append(new Option("Home (no folder)", ""));
  folders.forEach((f) => fs.append(new Option(f, f)));
  fs.value = folders.includes(keep) ? keep : inR2 ? "" : cur;

  // breadcrumbs
  const cr = $("#crumbs");
  cr.textContent = "";
  const home = el("button", "crumb" + (cur ? "" : " here"), "Home");
  home.onclick = () => open("");
  cr.append(home);
  if (inR2) {
    const add = el("button", "ghost small", "New file link"), re = el("button", "ghost small", "Refresh");
    add.onclick = () => r2Create();
    re.onclick = () => loadR2();
    cr.append(el("span", "sep", "/"), el("span", "crumb here", "R2 files"), add, re);
  } else if (cur) {
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
  fb.hidden = !!cur || !!q || (!folders.length && !R2.on);
  if (R2.on) { // the live folder of file links from r2-files, always first
    const b = el("button", "folder r2tile");
    b.innerHTML = CLOUD;
    b.append(el("span", "fname", "R2 files"), el("small", "", R2.loading && !R2.links.length ? "loading…" : R2.error ? "unavailable" : R2.links.length + (R2.links.length === 1 ? " link" : " links")));
    b.onclick = () => open(R2ID);
    fb.append(b);
  }
  folders.forEach((f) => {
    const n = links.filter((l) => l.folder === f).length, b = el("button", "folder");
    b.innerHTML = FOLDER;
    b.append(el("span", "fname", f), el("small", "", n + (n === 1 ? " link" : " links")));
    b.onclick = () => open(f);
    fb.append(b);
  });

  // links
  const rows = inR2 ? [] : links.filter((l) => (q ? (l.slug + " " + l.title + " " + l.target + " " + l.folder).toLowerCase().includes(q) : l.folder === cur));
  const r2rows = !R2.on ? [] : (inR2 || q) ? R2.links.filter((l) => !q || (l.name + " " + l.key).toLowerCase().includes(q)) : [];
  const box = $("#list");
  box.textContent = "";
  r2rows.forEach((l) => box.append(r2Item(l, q && !inR2)));
  if (inR2) {
    if (R2.error) box.append(el("div", "empty", "Could not load the file links: " + R2.error));
    else if (R2.loading && !R2.links.length) box.append(el("div", "empty", "Loading file links…"));
    else if (!r2rows.length) box.append(el("div", "empty", q ? "No file links match your search." : "No file links yet. Use “New file link”, or Share in the r2-files app."));
    return;
  }
  if (!rows.length && !r2rows.length) box.append(el("div", "empty", q ? "No links match your search." : cur ? "This folder is empty. Pick it as the folder when you create a link." : "No loose links here. Paste one on the left."));
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

api("config").then((c) => { HOST = c.host; $("#host").textContent = HOST + "/"; R2.on = !!c.r2; }).catch(() => {}).then(() => { load(); if (R2.on) loadR2(); });

const $ = (s) => document.querySelector(s);
let tab = "link", HOST = location.host, cur = "", data = { links: [], folders: [] };
$("#host").textContent = HOST + "/";
// ---- icons: the same set and sizes as the r2-files app (r2-files/public/app.js) ----
// UI icons: 24-unit outlines, 1.75 stroke.
const P = {
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  folderPlus: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  retry: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><path d="M14 14h2.5M14 14v2.5M20 14v6M14 20h6M17 17h.01"/>',
};
const ico = (n, s) => '<svg class="i" width="' + (s || 18) + '" height="' + (s || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[n] + '</svg>';
// File and folder icons: one ink, 1.8 stroke, solid details (class "f"), in a 38px tile like r2-files.
const PAGE = '<path d="M14.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5z"/><path d="M14.5 3v4.5H19"/>';
const MARK = {
  image: '<circle class="f" cx="9.6" cy="11.6" r="1.25"/><path class="f" d="M7.8 18 10.6 14.4l1.9 2.2 1.5-1.7 2.2 3.1z"/>',
  video: '<path class="f" d="M10 11.2v6.2a.6.6 0 0 0 .9.5l4.9-3.1a.6.6 0 0 0 0-1l-4.9-3.1a.6.6 0 0 0-.9.5z"/>',
  audio: '<circle class="f" cx="10" cy="16.6" r="1.6"/><path d="M11.6 16.6v-5.8l3.6-1v2"/>',
  pdf: '<rect class="f" x="7.5" y="12.6" width="9" height="4.8" rx="1.2"/><path d="M8.5 9.8h3.5"/>',
  doc: '<path d="M8.5 11.5h7M8.5 14.5h7M8.5 17.5h4"/>',
  archive: '<path class="f" d="M10.7 3.8h1.5v1.5h-1.5zM12.2 5.3h1.5v1.5h-1.5zM10.7 6.8h1.5v1.5h-1.5zM12.2 8.3h1.5v1.5h-1.5z"/><rect x="10.4" y="11" width="3.2" height="4.4" rx="1"/><path d="M12 13.4v.4"/>',
  code: '<path d="m10 12-2.2 2.4 2.2 2.4M14 12l2.2 2.4-2.2 2.4"/>',
  sheet: '<rect x="7.8" y="11" width="8.4" height="7" rx="1.2"/><path d="M7.8 14.5h8.4M12 11v7"/>',
  file: '<circle class="f" cx="9.4" cy="14.6" r="1"/><circle class="f" cx="12" cy="14.6" r="1"/><circle class="f" cx="14.6" cy="14.6" r="1"/>',
};
const FOLDER = '<path d="M3.5 7a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.4.6l1.4 1.4h6.6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 10h17"/><rect class="f" x="6" y="12.6" width="4" height="1.8" rx=".9"/>';
const CLOUD = '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><circle class="f" cx="12" cy="15" r="1"/>';
const EXT = { image: "jpg jpeg png gif webp avif svg bmp heic heif ico tif tiff", video: "mp4 mov m4v webm mkv avi wmv ogv", audio: "mp3 wav flac aac m4a ogg opus", pdf: "pdf", archive: "zip rar 7z tar gz tgz bz2 xz", code: "js ts jsx tsx json html htm css py rb go rs java c cpp h php sh sql yml yaml xml md", sheet: "xls xlsx csv tsv ods numbers", doc: "doc docx odt rtf txt pages ppt pptx key log srt vtt" };
const kindOf = (name) => { const e = name.includes(".") ? name.split(".").pop().toLowerCase() : ""; for (const k in EXT) if (e && (" " + EXT[k] + " ").includes(" " + e + " ")) return k; return "file"; };
const inkIcon = (body, s) => '<svg class="i ink" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
const fileIcon = (name, s) => inkIcon(PAGE + (MARK[kindOf(name)] || MARK.file), s);
// a 38px tile holding an ink icon: s 20 → 27px icon (folders), s 18 → 24px (link rows), as in r2-files
const tile = (body, s) => '<span class="tile">' + inkIcon(body, Math.round(s * 1.35)) + '</span>';
// a button with an icon and a label
const ibtn = (cls, icon, label) => { const b = el("button", cls); b.innerHTML = ico(icon, 15); b.append(el("span", "", label)); return b; };

// R2 files folder (file links owned by the r2-files Worker)
const R2ID = "\u0001r2"; // folder id that can never clash with a real folder name
const R2 = { on: false, links: [], loading: false, error: "", seq: 0, drives: [] };
// r2-files' other drives (Zenith): [{ id, label, root }], from /_api/r2/config. A file path that starts
// with a drive's root ("zenith:/…") is on that drive; every other path is in R2.
const SERVER = '<rect x="3.5" y="6" width="17" height="12" rx="3"/><path d="M3.5 13.5h17M11 15.9h5.5"/><circle class="f" cx="7.2" cy="15.9" r="1"/><path d="M7.5 9.6h9"/>';
const driveFor = (k) => R2.drives.find((d) => k.startsWith(d.root));
const driveName = (k) => { const d = driveFor(k); return d ? d.label : "R2"; };
const where = (k) => { const d = driveFor(k); return d ? d.label + ": " + k.slice(d.root.length) : "R2: " + k; };
// Files a browser can open by itself (same list as VIEW_MIME in r2-files/src/util.js)
const VIEW_EXT = " pdf jpg jpeg png gif webp avif svg bmp ico mp4 m4v webm mov ogv mp3 m4a aac wav ogg opus flac txt md log csv srt vtt json xml html htm ";
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
// Messages pop up as toasts, like r2-files: bottom centre (top on phones), gone after 3.5 s (errors 6 s).
// #toasts is a manual popover, so it sits in the top layer and shows above open dialogs too; it is
// re-raised for every toast in case a dialog opened after it.
function toast(text, type) {
  const box = $("#toasts"), t = el("div", "toast " + (type || "info"), text);
  box.append(t);
  if (box.showPopover) { try { if (box.matches(":popover-open")) box.hidePopover(); box.showPopover(); } catch {} }
  requestAnimationFrame(() => t.classList.add("in"));
  setTimeout(() => {
    t.classList.remove("in");
    setTimeout(() => { t.remove(); if (!box.children.length && box.hidePopover) try { box.hidePopover(); } catch {} }, 260);
  }, type === "err" ? 6000 : 3500);
}
const msg = (t, ok) => { if (t) toast(t, ok ? "ok" : "err"); };

// Clicking the "bunnxr" title shows or hides the shortener; the choice is remembered.
function showSheet(on, focus) {
  $("#sheet").hidden = !on;
  $("#app").classList.toggle("solo", !on);
  const logo = $("#logo");
  logo.setAttribute("aria-expanded", String(on));
  logo.title = on ? "Hide the link shortener" : "Show the link shortener";
  try { localStorage.setItem("sheet", on ? "1" : ""); } catch {}
  if (on && focus) $("#url").focus();
}
$("#logo").onclick = () => showSheet($("#sheet").hidden, true);
try { showSheet(localStorage.getItem("sheet") === "1"); } catch { showSheet(false); }

// ---- Settings menu (gear, top right) ----
// theme: OLED black by default. icons: show or hide every icon on the site (the logo and the gear stay).
// Both are saved permanently in this browser (localStorage) until changed here again.
// The <head> sets both on <html> before the page paints, so nothing flashes.
const SET = {
  theme: { store: () => localStorage, def: "dark" },
  icons: { store: () => localStorage, def: "on" },
};
function applySettings() {
  const ds = document.documentElement.dataset;
  document.querySelector('meta[name="theme-color"]').content = ds.theme === "light" ? "#fbf8f3" : "#000000";
  document.querySelectorAll("#setMenu [data-set]").forEach((b) => b.setAttribute("aria-pressed", String((ds[b.dataset.set] || SET[b.dataset.set].def) === b.dataset.val)));
}
document.querySelectorAll("#setMenu [data-set]").forEach((b) => (b.onclick = () => {
  const k = b.dataset.set;
  document.documentElement.dataset[k] = b.dataset.val;
  try { SET[k].store().setItem(k, b.dataset.val); } catch {}
  applySettings();
}));
function setMenu(on) {
  $("#setMenu").hidden = !on;
  $("#setBtn").setAttribute("aria-expanded", String(on));
}
$("#setBtn").onclick = () => setMenu($("#setMenu").hidden);
document.addEventListener("mousedown", (e) => { if (!$("#setMenu").hidden && !e.target.closest(".set")) setMenu(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#setMenu").hidden) { setMenu(false); $("#setBtn").focus(); } });
applySettings();

// Tab icon: the same bunny as r2-files. Chrome and Edge do not play animations inside tab icons, so the
// ear twitch is played here by swapping the icon frame by frame (0° → 11° → -4° → 0° over 0.7 s, every 3 s).
(function tabBunny() {
  const link = document.querySelector('link[rel="icon"]');
  if (!link || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const dark = matchMedia("(prefers-color-scheme: dark)");
  const icon = (a) => "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='2.5 2 35 35' fill='none' stroke='" + (dark.matches ? "#4fd1bf" : "#0f766e") + "' stroke-width='3.4' stroke-linecap='round'><path d='M15 24C9 14 11 3 16 4C20 5 19 15 19 24'/><path transform='rotate(" + a + " 25.2 24)' d='M25 24C31 14 29 3 24 4C20 5 21 15 21 24'/><rect x='9' y='24' width='22' height='11' rx='5.5'/></svg>");
  const keys = [[0, 0], [210, 11], [420, -4], [700, 0]]; // [ms, degrees]
  const angle = (t) => { for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, a0] = keys[i - 1], [t1, a1] = keys[i]; return a0 + (a1 - a0) * (t - t0) / (t1 - t0); } return 0; };
  const twitch = () => { const start = performance.now(); const tick = () => { const t = performance.now() - start; link.href = icon(angle(t).toFixed(1)); if (t < 700) setTimeout(tick, 40); }; tick(); };
  link.href = icon(0);
  dark.addEventListener("change", () => { link.href = icon(0); });
  setTimeout(function loop() { twitch(); setTimeout(loop, 3000); }, 1000);
})();
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
    if (type === "edit") { const old = L.find((x) => x.slug === v.from); L = [{ ...v.link, folder: old ? old.folder : v.link.folder }, ...L.filter((x) => x.slug !== v.from && x.slug !== v.link.slug)]; }
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

// The site's favicon in a 38px tile (24px, the size of the file icons); a globe when there is none.
function icon(l) {
  const box = el("span", "tile"), globe = () => { box.innerHTML = inkIcon(P.globe, 24); };
  try {
    const img = el("img");
    img.alt = "";
    img.src = "https://www.google.com/s2/favicons?sz=64&domain=" + new URL(l.target).hostname;
    img.onerror = globe;
    box.append(img);
  } catch { globe(); }
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
  const icoBox = el("span");
  icoBox.innerHTML = tile(PAGE + (MARK[kindOf(file)] || MARK.file), 18);
  const a = el("a", "", r2Url(l).replace(/^https?:\/\//, ""));
  a.href = r2Url(l); a.target = "_blank"; a.rel = "noopener";
  body.append(el("h3", "", file), a, dest(l.key ? where(l.key) + (l.size ? " · " + fmtSize(l.size) : "") : "No file"));
  const tags = [validity(l), l.mode === "view" ? "opens in browser" : l.mode === "download" ? "downloads" : "", showWhere ? "in R2 files" : ""].filter(Boolean);
  const meta = el("div", "meta" + (l.missing ? " bad" : ""), tags.join("  ·  "));
  if (l.exp) meta.title = new Date(l.exp * 1000).toLocaleString();
  body.append(meta);

  const copy = copyBtn(() => r2Url(l));
  const qr = ibtn("", "qr", "QR");
  qr.onclick = () => showQR(r2Url(l), file);
  const ren = ibtn("", "edit", "Rename");
  ren.onclick = async () => {
    const v = prompt("New address. The old one stops working.\n" + HOST + "/", l.name);
    if (!v || v.trim() === l.name) return;
    await r2Update(l, { newName: v.trim() }, "Address changed.");
  };
  const del = ibtn("del", "trash", "Delete");
  del.onclick = async () => {
    if (!confirm("Delete " + r2Url(l).replace(/^https?:\/\//, "") + "?\nThe file itself stays in " + (l.key ? driveName(l.key) : "R2") + ".")) return;
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
  item.append(icoBox.firstChild, body, acts);
  return item;
}
function copyBtn(url) {
  const b = ibtn("", "copy", "Copy"), label = b.querySelector("span");
  b.onclick = () => navigator.clipboard.writeText(url()).then(() => { label.textContent = "Copied"; setTimeout(() => (label.textContent = "Copy"), 1200); });
  return b;
}

// New file link: pick the drive (R2 or Zenith), browse it, pick a file, then address, type and validity.
const R2D = { dir: "", key: "" };
function r2Drives(root) { // the R2 / Zenith switch, shown only when r2-files has another drive
  const box = $("#r2drives");
  box.hidden = !R2.drives.length;
  box.textContent = "";
  [{ label: "R2", root: "", icon: CLOUD }, ...R2.drives.map((d) => ({ label: d.label, root: d.root, icon: SERVER }))].forEach((d) => {
    const b = el("button");
    b.type = "button";
    b.innerHTML = inkIcon(d.icon, 16);
    b.append(el("span", "", d.label));
    b.setAttribute("aria-pressed", String(d.root === root));
    b.onclick = () => { if (d.root !== root) r2Browse(d.root); };
    box.append(b);
  });
}
async function r2Browse(dir) {
  R2D.dir = dir;
  const drive = driveFor(dir), root = drive ? drive.root : "";
  r2Drives(root);
  const cr = $("#r2crumbs");
  cr.textContent = "";
  const top = el("button", "crumb" + (dir === root ? " here" : ""), drive ? drive.label : "R2 bucket");
  top.onclick = () => r2Browse(root);
  cr.append(top);
  let acc = root;
  dir.slice(root.length).split("/").filter(Boolean).forEach((p, i, arr) => {
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
    d.folders.forEach((f) => { const b = el("button", "r2row dir"); b.innerHTML = inkIcon(FOLDER, 22); b.append(el("span", "", f.slice(dir.length).replace(/\/$/, ""))); b.onclick = () => r2Browse(f); box.append(b); });
    d.files.forEach((f) => { const b = el("button", "r2row"); b.innerHTML = fileIcon(f.key, 22); b.append(el("span", "", f.key.slice(dir.length)), el("small", "", fmtSize(f.size))); b.onclick = () => r2Pick(f.key); box.append(b); });
    if (!d.folders.length && !d.files.length) box.append(el("div", "empty", "This folder is empty."));
  } catch (e) { box.textContent = ""; box.append(el("div", "empty", e.message)); }
}
function r2Pick(key) {
  R2D.key = key;
  $("#r2file").textContent = where(key);
  $("#r2pick").hidden = true; $("#r2form").hidden = false; $("#r2create").hidden = false;
  $("#r2typel").hidden = !canView(key);
  $("#r2type").value = "view"; $("#r2name").value = "";
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
  const s = +$("#r2valid").value;
  try {
    const r = await post("r2/link-add", { key: R2D.key, name: $("#r2name").value.trim(), exp: s ? Math.floor(Date.now() / 1000) + s : 0, mode: canView(R2D.key) ? $("#r2type").value : "" });
    R2.links = [r, ...R2.links.filter((x) => x.name !== r.name)];
    render();
    navigator.clipboard?.writeText(r.url).catch(() => {});
    msg("Created and copied: " + r.url, true);
    $("#r2name").value = "";
  } catch (e) { msg(e.message, false); }
};

// ---- Edit a short link: name, destination and address (the old address stops working) ----
let editing = null;
function editLink(l) {
  editing = l;
  $("#edhost").textContent = HOST + "/";
  $("#edname").value = l.title || "";
  $("#edtarget").value = l.target || "";
  $("#edslug").value = l.slug;
  $("#edd").showModal();
  $("#edtarget").focus();
}
$("#edx").onclick = () => $("#edd").close();
$("#edf").onsubmit = async (e) => {
  e.preventDefault();
  const l = editing;
  if (!l) return;
  const body = { slug: l.slug, title: $("#edname").value, target: $("#edtarget").value.trim(), newSlug: $("#edslug").value.trim() || l.slug };
  try {
    const d = await post("edit", body);
    $("#edd").close();
    commit("edit", { from: l.slug, link: d.link });
    msg(d.link.slug !== l.slug ? "Saved. The link is now " + d.short + " (the old address no longer works)." : "Saved.", true);
  } catch (err) { msg(err.message, false); }
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
    const add = ibtn("ghost small", "plus", "New file link"), re = ibtn("ghost small", "retry", "Refresh");
    add.onclick = () => r2Create();
    re.onclick = () => loadR2();
    cr.append(el("span", "sep", "/"), el("span", "crumb here", "R2 files"), add, re);
  } else if (cur) {
    const del = ibtn("ghost small", "trash", "Delete folder");
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
    b.innerHTML = tile(CLOUD, 20);
    b.append(el("span", "fname", "R2 files"), el("small", "", R2.loading && !R2.links.length ? "loading…" : R2.error ? "unavailable" : R2.links.length + (R2.links.length === 1 ? " link" : " links")));
    b.onclick = () => open(R2ID);
    fb.append(b);
  }
  folders.forEach((f) => {
    const n = links.filter((l) => l.folder === f).length, b = el("button", "folder");
    b.innerHTML = tile(FOLDER, 20);
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
    const copy = copyBtn(() => shortUrl(l.slug));
    const qr = ibtn("", "qr", "QR");
    qr.onclick = () => showQR(shortUrl(l.slug), l.title || HOST + "/" + l.slug);
    const ed = ibtn("", "edit", "Edit");
    ed.onclick = () => editLink(l);
    const del = ibtn("del", "trash", "Delete");
    del.onclick = async () => {
      if (!confirm("Delete " + HOST + "/" + l.slug + "?")) return;
      try { await api("delete?slug=" + encodeURIComponent(l.slug), { method: "DELETE" }); commit("del", l.slug); } catch (e) { msg(e.message, false); }
    };
    acts.append(copy, qr, ed, del);
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

// ---- QR codes: "styled" (round dots, teal rounded eyes, the bunny in the middle) or "plain" ----
// The choice is remembered. Styled uses error correction H (30%), so the logo hole (about 5% of the
// modules) still scans; it is drawn from the qrcodejs matrix, with plain as the fallback.
const QR = { text: "", label: "", style: "styled" };
try { QR.style = localStorage.getItem("qrstyle") === "plain" ? "plain" : "styled"; } catch {}
const BUNNY = ["M15 24C9 14 11 3 16 4C20 5 19 15 19 24", "M25 24C31 14 29 3 24 4C20 5 21 15 21 24", "M14.5 24H25.5A5.5 5.5 0 0 1 25.5 35H14.5A5.5 5.5 0 0 1 14.5 24Z"];
function rrect(x, a, b, w, h, r) {
  x.beginPath(); x.moveTo(a + r, b);
  x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
}
function styledQR(text, px) {
  let m;
  try { m = new QRCode(document.createElement("div"), { text, width: 64, height: 64, correctLevel: QRCode.CorrectLevel.H })._oQRCode; } catch { return null; }
  if (!m || !m.getModuleCount) return null; // qrcodejs keeps the matrix here: getModuleCount(), isDark(row, col)
  const n = m.getModuleCount(), quiet = 4, cs = px / (n + quiet * 2);
  const c = document.createElement("canvas"), x = c.getContext("2d");
  c.width = c.height = px;
  x.fillStyle = "#fff"; x.fillRect(0, 0, px, px);
  const ink = "#1c1f1d", acc = "#0f766e";
  let hole = Math.round(n * 0.22); if ((n - hole) % 2) hole++; // centred, whole modules
  const h0 = (n - hole) / 2, h1 = h0 + hole;
  const eyeAt = (r, k) => (r < 7 && k < 7) || (r < 7 && k >= n - 7) || (r >= n - 7 && k < 7);
  x.fillStyle = ink;
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) {
    if (!m.isDark(r, k) || eyeAt(r, k) || (r >= h0 && r < h1 && k >= h0 && k < h1)) continue;
    x.beginPath(); x.arc((quiet + k + 0.5) * cs, (quiet + r + 0.5) * cs, cs * 0.42, 0, Math.PI * 2); x.fill();
  }
  [[0, 0], [0, n - 7], [n - 7, 0]].forEach(([r, k]) => { // the three corner eyes
    const ox = (quiet + k) * cs, oy = (quiet + r) * cs;
    x.fillStyle = acc; rrect(x, ox, oy, 7 * cs, 7 * cs, 2.2 * cs); x.fill();
    x.fillStyle = "#fff"; rrect(x, ox + cs, oy + cs, 5 * cs, 5 * cs, 1.5 * cs); x.fill();
    x.fillStyle = acc; rrect(x, ox + 2 * cs, oy + 2 * cs, 3 * cs, 3 * cs, cs); x.fill();
  });
  const at = (quiet + h0) * cs, size = hole * cs, s = (size * 0.8) / 35; // the bunny (viewBox 2.5 2 35 35)
  x.save();
  x.translate(at + size * 0.1, at + size * 0.1); x.scale(s, s); x.translate(-2.5, -2);
  x.strokeStyle = acc; x.lineWidth = 3.2; x.lineCap = "round"; x.lineJoin = "round";
  BUNNY.forEach((d) => x.stroke(new Path2D(d)));
  x.restore();
  return c;
}
function drawQR() {
  const box = $("#qrbox");
  box.textContent = "";
  box.classList.toggle("styled", QR.style === "styled");
  const c = QR.style === "styled" ? styledQR(QR.text, 960) : null;
  if (c) { c.className = "qrc"; box.append(c); }
  else new QRCode(box, { text: QR.text, width: 240, height: 240, correctLevel: QRCode.CorrectLevel.M });
  document.querySelectorAll("[data-qr]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.qr === QR.style)));
}
document.querySelectorAll("[data-qr]").forEach((b) => (b.onclick = () => {
  QR.style = b.dataset.qr;
  try { localStorage.setItem("qrstyle", QR.style); } catch {}
  drawQR();
}));
function showQR(text, label) {
  QR.text = text; QR.label = label;
  drawQR();
  $("#qrlabel").textContent = label;
  $("#qrd").showModal();
}
$("#qrdl").onclick = () => {
  const a = document.createElement("a");
  const styled = $("#qrbox canvas.qrc");
  if (styled) a.href = styled.toDataURL("image/png"); // 960px, quiet zone included
  else {
    const src = $("#qrbox canvas") || $("#qrbox img");
    const c = document.createElement("canvas");
    c.width = c.height = 272; // 16px white quiet zone so phones scan it reliably
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, 272, 272); x.drawImage(src, 16, 16, 240, 240);
    a.href = c.toDataURL("image/png");
  }
  a.download = "qr.png"; a.click();
};
$("#qrx").onclick = () => $("#qrd").close();

api("config").then((c) => { HOST = c.host; $("#host").textContent = HOST + "/"; R2.on = !!c.r2; }).catch(() => {}).then(() => {
  load();
  if (!R2.on) return;
  loadR2();
  // which other drives (Zenith) r2-files can link files from; without it the picker shows R2 only
  api("r2/config").then((d) => { R2.drives = Array.isArray(d.drives) ? d.drives.filter((x) => x && x.root && x.label) : []; render(); }).catch(() => {});
});

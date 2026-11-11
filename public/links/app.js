const $ = (s) => document.querySelector(s);
let tab = "link", links = [];
$("#host").textContent = location.host + "/";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
const msg = (t, ok) => { const m = $("#msg"); m.textContent = t; m.className = ok ? "ok" : "err"; };
const shortUrl = (slug) => location.origin + "/" + slug;

async function api(path, opt) {
  const r = await fetch("/_api/" + path, opt);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Something went wrong (" + r.status + ")");
  return d;
}

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
    const d = await api("add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target, title: $("#name").value, slug: $("#slug").value }),
    });
    navigator.clipboard?.writeText(d.short).catch(() => {});
    msg("Created and copied: " + d.short, true);
    ["#url", "#name", "#slug"].forEach((s) => ($(s).value = ""));
    await load();
  } catch (e) { msg(e.message, false); }
};
$("#url").onkeydown = (e) => e.key === "Enter" && $("#go").click();
$("#q").oninput = render;

async function load() {
  try { links = await api("list"); render(); } catch (e) { msg(e.message, false); }
}

function icon(l) {
  const box = el("div", "ico");
  try {
    const img = el("img");
    img.alt = "";
    img.src = "https://www.google.com/s2/favicons?sz=64&domain=" + new URL(l.target).hostname;
    img.onerror = () => { img.remove(); box.textContent = (l.title || l.slug)[0].toUpperCase(); };
    box.append(img);
  } catch { box.textContent = (l.title || l.slug)[0].toUpperCase(); }
  return box;
}

function render() {
  const q = $("#q").value.toLowerCase();
  const rows = links.filter((l) => (l.slug + " " + l.title + " " + l.target).toLowerCase().includes(q));
  $("#count").textContent = "(" + links.length + ")";
  const box = $("#list");
  box.textContent = "";
  if (!rows.length) box.append(el("div", "empty", links.length ? "No links match your search." : "No links yet. Paste one above to create your first."));
  rows.forEach((l) => {
    const item = el("div", "item"), body = el("div", "body"), acts = el("div", "acts");
    const a = el("a", "", location.host + "/" + l.slug);
    a.href = shortUrl(l.slug); a.target = "_blank"; a.rel = "noopener";
    body.append(el("h3", "", l.title || "/" + l.slug), a, el("div", "dest", "↳ " + l.target));
    if (l.created) body.append(el("div", "meta", new Date(l.created).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })));
    const copy = el("button", "", "Copy");
    copy.onclick = () => navigator.clipboard.writeText(shortUrl(l.slug)).then(() => { copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy"), 1200); });
    const qr = el("button", "", "QR");
    qr.onclick = () => showQR(shortUrl(l.slug), l.title || location.host + "/" + l.slug);
    const del = el("button", "del", "Delete");
    del.onclick = async () => {
      if (!confirm("Delete " + location.host + "/" + l.slug + "?")) return;
      try { await api("delete?slug=" + encodeURIComponent(l.slug), { method: "DELETE" }); await load(); } catch (e) { msg(e.message, false); }
    };
    acts.append(copy, qr, del);
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

load();

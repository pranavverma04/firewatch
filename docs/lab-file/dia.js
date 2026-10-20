// Diagram helpers for the Software Engineering One Goal: DFD, use case, ER, flow graph, curves.
let _dn = 0;
class Dia {
  constructor(w, h) { this.w = w; this.h = h; this.s = ''; this.n = {}; this.id = 'd' + (++_dn); }
  _t(x, y, t, cls) {
    const L = String(t).split('|'), lh = 10.5, y0 = y - (L.length - 1) * lh / 2 + 3.2;
    return L.map((l, i) => `<text x="${x}" y="${y0 + i * lh}" text-anchor="middle"${cls ? ` class="${cls}"` : ''}>${l}</text>`).join('');
  }
  // external entity / plain box
  box(id, x, y, w, h, t, fill) {
    this.n[id] = { k: 'r', x, y, hw: w / 2, hh: h / 2 };
    this.s += `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" fill="${fill || '#eef4fa'}" stroke="#0b4f8a" stroke-width="1.3"/>` + this._t(x, y, t);
    return this;
  }
  // process bubble / node
  circ(id, x, y, r, t, fill) {
    this.n[id] = { k: 'e', x, y, hw: r, hh: r };
    this.s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill || '#f1f8f3'}" stroke="#1b6e3c" stroke-width="1.3"/>` + this._t(x, y, t);
    return this;
  }
  // use case / attribute oval
  ell(id, x, y, rx, ry, t, fill) {
    this.n[id] = { k: 'e', x, y, hw: rx, hh: ry };
    this.s += `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill || '#fff8e6'}" stroke="#8a5a00" stroke-width="1.2"/>` + this._t(x, y, t);
    return this;
  }
  // data store: two parallel lines
  store(id, x, y, w, t) {
    const h = 20; this.n[id] = { k: 'r', x, y, hw: w / 2, hh: h / 2 };
    this.s += `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" fill="#fdf3f2" stroke="none"/>` +
      `<path d="M${x - w / 2} ${y - h / 2}H${x + w / 2}M${x - w / 2} ${y + h / 2}H${x + w / 2}" stroke="#b3261e" stroke-width="1.5"/>` + this._t(x, y, t);
    return this;
  }
  // relationship diamond
  dmd(id, x, y, w, h, t) {
    this.n[id] = { k: 'd', x, y, hw: w / 2, hh: h / 2 };
    this.s += `<path d="M${x - w / 2} ${y}L${x} ${y - h / 2}L${x + w / 2} ${y}L${x} ${y + h / 2}Z" fill="#f3f0fb" stroke="#4a3496" stroke-width="1.2"/>` + this._t(x, y, t);
    return this;
  }
  actor(id, x, y, t) {
    this.n[id] = { k: 'r', x, y, hw: 13, hh: 22 };
    this.s += `<g stroke="#1c2330" stroke-width="1.3" fill="none"><circle cx="${x}" cy="${y - 15}" r="5.5"/>` +
      `<path d="M${x} ${y - 9.5}V${y + 6}M${x - 10} ${y - 3}H${x + 10}M${x} ${y + 6}L${x - 8} ${y + 19}M${x} ${y + 6}L${x + 8} ${y + 19}"/></g>` +
      this._t(x, y + 30, t, 'b');
    return this;
  }
  frame(x, y, w, h, t) {
    this.s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#667" stroke-width="1" rx="3"/><text x="${x + w / 2}" y="${y + 12}" text-anchor="middle" class="b">${t}</text>`;
    return this;
  }
  label(x, y, t, cls) { this.s += this._t(x, y, t, cls); return this; }
  _clip(a, ux, uy) {
    let t;
    if (a.k === 'r') t = Math.min(a.hw / Math.abs(ux || 1e-9), a.hh / Math.abs(uy || 1e-9));
    else if (a.k === 'e') t = 1 / Math.sqrt((ux / a.hw) ** 2 + (uy / a.hh) ** 2);
    else t = 1 / (Math.abs(ux) / a.hw + Math.abs(uy) / a.hh);
    return [a.x + ux * t, a.y + uy * t];
  }
  // o: {off: sideways shift, dx, dy: label nudge, plain: no arrow head, dash, both}
  link(a, b, t, o) {
    o = o || {}; const A = this.n[a], B = this.n[b];
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    let [x1, y1] = this._clip(A, ux, uy), [x2, y2] = this._clip(B, -ux, -uy);
    const off = o.off || 0, nx = -uy * off, ny = ux * off;
    x1 += nx; y1 += ny; x2 += nx; y2 += ny;
    const m = o.plain ? '' : ` marker-end="url(#${this.id}a)"` + (o.both ? ` marker-start="url(#${this.id}b)"` : '');
    this.s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#333" stroke-width="1.1"${o.dash ? ' stroke-dasharray="4 3"' : ''}${m}/>`;
    if (t) this.s += this._t((x1 + x2) / 2 + (o.dx || 0), (y1 + y2) / 2 + (o.dy || 0), t, 'lb');
    return this;
  }
  path(d, o) { o = o || {}; this.s += `<path d="${d}" fill="none" stroke="${o.c || '#333'}" stroke-width="${o.w || 1.1}"${o.dash ? ' stroke-dasharray="4 3"' : ''}${o.arrow ? ` marker-end="url(#${this.id}a)"` : ''}/>`; return this; }
  out(cap, zoom) {
    const defs = `<defs><marker id="${this.id}a" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="#333"/></marker>` +
      `<marker id="${this.id}b" markerWidth="8" markerHeight="8" refX="0" refY="3.5" orient="auto"><path d="M7 0L0 3.5L7 7Z" fill="#333"/></marker></defs>`;
    const html = `<div class="figs"><figure class="dg"${zoom ? ` style="zoom:${zoom}"` : ''}><svg width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}">${defs}${this.s}</svg>` +
      (cap ? `<figcaption>${cap}</figcaption>` : '') + `</figure></div>`;
    document.currentScript.insertAdjacentHTML('beforebegin', html);
  }
}

// Spiral model: four quadrants and a growing spiral

// ER entity drawn as a table: title row + one row per attribute
Dia.prototype.ent = function (id, x, y, w, title, rows, fill) {
  const rh = 15, h = rh * (rows.length + 1);
  this.n[id] = { k: 'r', x: x + w / 2, y: y + h / 2, hw: w / 2, hh: h / 2 };
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#222" stroke-width="1.2"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${rh}" fill="${fill}" stroke="#222" stroke-width="1.2"/>` +
    `<text x="${x + w / 2}" y="${y + 11}" text-anchor="middle" class="b">${title}</text>`;
  rows.forEach((r, i) => {
    const yy = y + rh * (i + 1);
    s += `<line x1="${x}" y1="${yy}" x2="${x + w}" y2="${yy}" stroke="#999" stroke-width=".6"/>` +
      `<text x="${x + 5}" y="${yy + 11}">${r}</text>`;
  });
  this.s += s; return this;
};

// actor-to-use-case line that ends at the ellipse's left tip, so it never cuts through other ellipses
Dia.prototype.toLeft = function (a, b) {
  const A = this.n[a], B = this.n[b];
  return this.path(`M${A.x + 14} ${A.y - 2}L${B.x - B.hw} ${B.y}`);
};

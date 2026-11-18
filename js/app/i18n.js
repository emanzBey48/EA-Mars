// TR -> EN çeviri katmanı: t(), DOM çevirici (MutationObserver), dil durumu. Kaynak dil Türkçedir.
import { DICT, RULES } from './i18n-dict.js';

const KEY = 'marswalk.lang';
const norm = (s) => s.replace(/[’‘`]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const LETTER = /[A-Za-zÇĞİÖŞÜçğıöşü]/;
const TRAIL = /^([\s\S]*?)([\s.:…!·]+)$/;
const SEPS = [' · ', ' — ', ' - ', '. ', '; ', ': ', ', ', ' / '];

const EXACT = new Map();
const TEMPLATES = [];
for (const [tr, en] of DICT) {
  const k = norm(tr);
  if (/\{\d\}/.test(k)) {
    const src = k.split(/(\{\d\})/).map((p) => (/^\{\d\}$/.test(p) ? '([\\s\\S]+?)' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('');
    TEMPLATES.push({ re: new RegExp(`^${src}$`), en, len: k.length });
  } else EXACT.set(k, en);
}
TEMPLATES.sort((a, b) => b.len - a.len);

function tr(s, depth) {
  if (depth > 5 || !LETTER.test(s)) return s;
  const hit = EXACT.get(s);
  if (hit !== undefined) return hit;
  for (const t of TEMPLATES) {
    const m = t.re.exec(s);
    if (m) return t.en.replace(/\{(\d)\}/g, (_, i) => tr(m[+i + 1].trim(), depth + 1));
  }
  const tm = TRAIL.exec(s);
  if (tm && tm[1]) { const r = tr(tm[1], depth + 1); if (r !== tm[1]) return r + tm[2].trimStart(); }
  const pm = /^([^\p{L}\p{N}]+)([\s\S]+)$/u.exec(s);
  if (pm) { const r = tr(pm[2], depth + 1); if (r !== pm[2]) return pm[1] + r; }
  for (const sep of SEPS) {
    if (!s.includes(sep)) continue;
    let changed = false;
    const out = s.split(sep).map((p) => { const r = tr(p, depth + 1); if (r !== p) changed = true; return r; });
    if (changed) return out.join(sep);
  }
  return s;
}

const cache = new Map();
/** Türkçe metni İngilizceye çevirir (bulunamazsa aynen döner; baştaki/sondaki boşluk korunur). */
export function translate(text) {
  if (typeof text !== 'string' || !text) return text;
  if (cache.has(text)) return cache.get(text);
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  let out = text;
  if (m[2]) {
    let r = tr(norm(m[2]), 0);
    for (const [re, rep] of RULES) r = r.replace(re, rep);
    out = r === norm(m[2]) ? text : m[1] + r + m[3];
  }
  if (cache.size > 4000) cache.clear();
  cache.set(text, out);
  return out;
}

let lang = 'tr';
export const getLang = () => lang;
export function t(trText, params) {
  let s = lang === 'en' ? translate(trText) : trText;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
const textRec = new WeakMap();
const attrRec = new WeakMap();
let observer = null;
let docRef = null;

const skip = (el) => !el || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/.test(el.tagName) || el.closest?.('[data-i18n-skip]');

function doText(node) {
  if (skip(node.parentElement)) return;
  const rec = textRec.get(node);
  if (rec && rec.applied === node.data) return;
  const en = translate(node.data);
  textRec.set(node, { orig: node.data, applied: en });
  if (en !== node.data) node.data = en;
}
function doAttr(el, name) {
  const v = el.getAttribute(name);
  if (v == null || skip(el)) return;
  let m = attrRec.get(el);
  if (!m) { m = new Map(); attrRec.set(el, m); }
  const rec = m.get(name);
  if (rec && rec.applied === v) return;
  const en = translate(v);
  m.set(name, { orig: v, applied: en });
  if (en !== v) el.setAttribute(name, en);
}
function doTree(root) {
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1 || skip(root)) return;
  for (const a of ATTRS) doAttr(root, a);
  const w = docRef.createTreeWalker(root, 5, { acceptNode: (n) => (n.nodeType === 1 && skip(n) ? 2 : 1) });
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === 3) doText(n); else for (const a of ATTRS) doAttr(n, a);
  }
}
function restore() {
  const w = docRef.createTreeWalker(docRef.documentElement, 5);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === 3) {
      const r = textRec.get(n);
      if (r && r.applied === n.data) n.data = r.orig;
    } else {
      const m = attrRec.get(n);
      if (m) for (const [a, r] of m) if (n.getAttribute(a) === r.applied) n.setAttribute(a, r.orig);
    }
  }
}

function apply(next, win) {
  lang = next;
  docRef.documentElement.lang = next;
  if (next === 'en') {
    if (!observer) {
      observer = new win.MutationObserver((recs) => {
        for (const r of recs) {
          if (r.type === 'characterData') doText(r.target);
          else if (r.type === 'childList') r.addedNodes.forEach(doTree);
          else if (r.type === 'attributes') doAttr(r.target, r.attributeName);
        }
        observer.takeRecords();
      });
    }
    doTree(docRef.documentElement);
    observer.takeRecords();
    observer.observe(docRef.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  } else {
    observer?.disconnect();
    restore();
  }
  win.dispatchEvent(new win.CustomEvent('langchange', { detail: { lang: next } }));
}

export function setLang(next) {
  if (next !== 'tr' && next !== 'en') return;
  if (next === lang || !docRef) return;
  try { docRef.defaultView.localStorage.setItem(KEY, next); } catch { /* yok say */ }
  apply(next, docRef.defaultView);
}

/** Başlangıç dili: ?lang= > localStorage > 'tr'. */
export function initI18n({ doc = document } = {}) {
  docRef = doc;
  const win = doc.defaultView;
  let want = null;
  try { want = new URLSearchParams(win.location.search).get('lang'); } catch { /* yok say */ }
  if (want !== 'tr' && want !== 'en') {
    try { want = win.localStorage.getItem(KEY); } catch { want = null; }
  }
  if (want === 'en') apply('en', win);
  return lang;
}

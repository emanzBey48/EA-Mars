// Sol alt köşe TR | EN segment anahtarı.
import { getLang, setLang } from './i18n.js';

export function createLangSwitch({ doc = document } = {}) {
  const wrap = doc.createElement('div');
  wrap.className = 'mw-lang-switch';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Language / Dil');
  wrap.setAttribute('data-i18n-skip', '');
  const btns = {};
  for (const [id, label] of [['tr', 'TR'], ['en', 'EN']]) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.lang = id;
    b.addEventListener('click', () => setLang(id));
    btns[id] = b;
    wrap.appendChild(b);
  }
  const sync = () => { for (const id of ['tr', 'en']) { const on = getLang() === id; btns[id].setAttribute('aria-pressed', String(on)); btns[id].classList.toggle('is-on', on); } };
  doc.defaultView.addEventListener('langchange', sync);
  sync();
  doc.body.appendChild(wrap);
  return { el: wrap, dispose() { wrap.remove(); } };
}

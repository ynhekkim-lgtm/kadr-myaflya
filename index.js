/* Кадр Мяфли для SillyTavern — картинка сцены под ответом персонажа.
   Автор: Вика-Мяфля (@vika_myaflay). Стили SLAY — автор Wewwa.
   Ядро общее с плагином для Tavo (core.js), здесь — мост к SillyTavern и интерфейс. */
import './lib.js';
import './core.js';

const KEY = 'kadrMyaflya';
const ctx = () => SillyTavern.getContext();
const W = window;

/* ---------- хранилище ---------- */
function store() {
    const s = ctx().extensionSettings;
    s[KEY] ??= {};
    s[KEY].v ??= {};
    s[KEY].opt ??= { chip: 'all' };
    s[KEY].files ??= {};
    return s[KEY];
}
const saveSt = () => ctx().saveSettingsDebounced();
function hashN(x) { let h = 0; x = String(x); for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) >>> 0; return h.toString(36); }

/* ---------- id сообщений: стабильные, не зависят от позиции ---------- */
function chatId() { try { return String(ctx().getCurrentChatId?.() ?? ctx().chatId ?? ''); } catch { return ''; } }
function idOf(i) {
    const m = ctx().chat?.[i];
    if (!m) return '';
    return 'm' + hashN(chatId() + '|' + (m.send_date || '') + '|' + (m.name || '') + '|' + i);
}
function indexOf(id) {
    const chat = ctx().chat || [];
    for (let i = chat.length - 1; i >= 0; i--) if (idOf(i) === String(id)) return i;
    return -1;
}

/* ---------- аватары и описания ---------- */
function charAvatarUrl(av) { return av ? '/characters/' + encodeURIComponent(av) : ''; }
function personaAvatar() {
    const c = ctx();
    if (c.userAvatar) return c.userAvatar;
    if (c.user_avatar) return c.user_avatar;
    const ps = c.powerUserSettings?.personas || {};
    for (const k in ps) if (ps[k] === c.name1) return k;
    return '';
}
function personaUrl(av) { return av ? '/User%20Avatars/' + encodeURIComponent(av) : ''; }
function currentChars() {
    const c = ctx();
    const list = [];
    if (c.groupId != null && c.groupId !== '') {
        const g = (c.groups || []).find(x => String(x.id) === String(c.groupId));
        (g?.members || []).forEach(av => { const ch = (c.characters || []).find(x => x.avatar === av); if (ch) list.push(ch); });
    } else {
        const ch = c.characters?.[c.characterId];
        if (ch) list.push(ch);
    }
    return list;
}
function charByAvatar(av) { return (ctx().characters || []).find(x => x.avatar === av); }

/* ---------- файлы картинок: кладём в галерею SillyTavern ---------- */
async function headers(json = true) {
    const h = ctx().getRequestHeaders ? ctx().getRequestHeaders() : {};
    if (!json) delete h['Content-Type'];
    return h;
}
function dataUrlToB64(u) { const m = String(u).match(/^data:([^;,]+)?(;base64)?,(.*)$/); if (!m) return null; return { mime: m[1] || 'image/png', b64: m[2] ? m[3] : btoa(unescape(decodeURIComponent(m[3]))) }; }
async function blobToDataUrl(b) { return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); }); }
const fileApi = {
    async save(name, data, opt = {}) {
        name = String(name);
        if (/\.(json|txt)$/i.test(name)) return null; /* служебные копии ядру не нужны — всё лежит в настройках */
        if (opt.encoding === 'url' && /^https?:/.test(data)) return data;
        let url = data;
        if (/^https?:/.test(url)) { try { url = await blobToDataUrl(await (await fetch(url)).blob()); } catch { return data; } }
        const p = dataUrlToB64(url);
        if (!p) return null;
        const ext = (p.mime.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '') || 'png';
        const base = name.replace(/\.[a-z0-9]+$/i, '').replace(/[^\w.-]/g, '_').slice(0, 120);
        const r = await fetch('/api/images/upload', { method: 'POST', headers: await headers(), body: JSON.stringify({ image: p.b64, format: ext, ch_name: 'Kadr', filename: base }) });
        if (!r.ok) throw new Error('не удалось сохранить картинку (' + r.status + ')');
        const j = await r.json();
        const path = j.path ? (String(j.path).startsWith('/') ? j.path : '/' + j.path) : null;
        if (path) { store().files[name] = path; saveSt(); }
        return path;
    },
    async load(name, opt = {}) {
        name = String(name);
        if (/\.(json|txt)$/i.test(name)) return null;
        const path = store().files[name] || (/^\/|^user\//.test(name) ? name : null);
        if (!path) return null;
        const r = await fetch(path);
        if (!r.ok) return null;
        return await blobToDataUrl(await r.blob());
    },
    async delete(name) {
        const path = store().files[String(name)] || String(name);
        try { await fetch('/api/images/delete', { method: 'POST', headers: await headers(), body: JSON.stringify({ path: path.replace(/^\//, '') }) }); } catch { /* ничего */ }
        delete store().files[String(name)]; saveSt();
        return true;
    },
};

/* ---------- мост «tavo» для ядра ---------- */
function msgObj(i) {
    const m = ctx().chat?.[i];
    if (!m) return null;
    return { id: idOf(i), content: m.mes || '', role: m.is_user ? 'user' : (m.is_system ? 'system' : 'assistant'), name: m.name };
}
const T = {
    plugin: { config: { get: k => store().opt[k] } },
    variable: {
        get: (k, sc) => store().v[(sc || 'chat') + '::' + k] ?? null,
        set: (k, v, sc) => { const key = (sc || 'chat') + '::' + k; if (v === '' || v == null) delete store().v[key]; else store().v[key] = v; saveSt(); return true; },
    },
    file: fileApi,
    chat: {
        current: () => {
            const id = chatId();
            if (!id) return null;
            const pa = personaAvatar();
            return {
                id,
                characters: currentChars().map(ch => ({ id: ch.avatar, name: ch.name, avatar: charAvatarUrl(ch.avatar) })),
                persona: { id: pa || ctx().name1, name: ctx().name1 },
            };
        },
    },
    character: {
        get: id => {
            const ch = charByAvatar(id);
            if (!ch) return null;
            return { name: ch.name, avatar: charAvatarUrl(ch.avatar), data: { description: ch.description || ch.data?.description || '' } };
        },
    },
    persona: {
        get: () => ({ name: ctx().name1, avatar: personaUrl(personaAvatar()), data: { description: ctx().powerUserSettings?.persona_description || '' } }),
    },
    message: {
        get: id => { const i = indexOf(id); return i < 0 ? null : msgObj(i); },
        count: () => (ctx().chat || []).length,
        find: (range, opt = {}) => {
            const chat = ctx().chat || [];
            const a = Math.max(0, range[0]), b = Math.min(chat.length - 1, range[1]);
            const out = [];
            for (let i = a; i <= b; i++) { const m = msgObj(i); if (!m) continue; if (opt.hidden === false && chat[i].is_system) continue; out.push(m); }
            return out;
        },
    },
    generate: async (prompt) => {
        const c = ctx();
        try {
            const r = await c.generateRaw({ prompt, systemPrompt: '' });
            if (r && String(r).trim()) return String(r);
        } catch { /* старый SillyTavern */ }
        return String(await c.generateQuietPrompt(prompt, false, true) || '');
    },
    utils: { toast: s => { try { toastr.info(String(s), 'Кадр'); } catch { /* */ } } },
};

const K = W.__KADR(T);
const LIB = W.__KADR_LIB || [];

/* ---------- полоска под сообщением ---------- */
const STRIP_HTML = `
<div class="kdr-pic" hidden>
  <div class="kdr-frame"><img alt=""><span class="kdr-badge"></span></div>
  <div class="kdr-pbar"><button type="button" data-a="prev" title="предыдущий">‹</button><span class="kdr-n"></span><button type="button" data-a="next" title="следующий">›</button><span class="kdr-sp"></span><button type="button" data-a="dl" title="скачать">⤓</button><button type="button" data-a="del" title="удалить">✕</button></div>
</div>
<div class="kdr-row">
  <button type="button" class="kdr-chip" data-a="go"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h16v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M4 9l1.2-4.2L19 2.6l.8 2.9z"/><path d="M8.2 4.1l2.3 3.4M12.6 3.4l2.3 3.4"/></svg><span class="kdr-cl">Кадр</span></button>
  <button type="button" class="kdr-sty" data-a="sty"></button>
  <button type="button" class="kdr-w" data-a="wh">✎ шёпот</button>
</div>
<div class="kdr-wbox" hidden><input type="text" placeholder="крупно, со спины, дождь, она смеётся…"><button type="button" data-a="shoot">Снять</button></div>
<div class="kdr-msg" hidden></div>`;

const strips = new Map(); /* id -> api */
function sec(ms) { const s = Math.round(ms / 1000); return s < 60 ? s + ' с' : Math.floor(s / 60) + ' мин ' + (s % 60) + ' с'; }

function makeStrip(mesEl, i) {
    const id = idOf(i);
    const root = document.createElement('div');
    root.className = 'kdr-s';
    root.dataset.kid = id;
    root.innerHTML = STRIP_HTML;
    const q = s => root.querySelector(s);
    const img = q('img'), msg = q('.kdr-msg'), chip = q('.kdr-chip'), cl = q('.kdr-cl'), stb = q('.kdr-sty'), wbox = q('.kdr-wbox'), inp = q('.kdr-wbox input');
    let R = null, P = null, tick = 0, poll = 0;
    const isLast = () => i === (ctx().chat || []).length - 1;
    function showMsg(t, bad, retry) {
        msg.hidden = !t; msg.className = 'kdr-msg' + (bad ? ' bad' : ''); msg.textContent = t || '';
        if (retry) { const b = document.createElement('button'); b.type = 'button'; b.textContent = 'повторить'; b.onclick = () => go(); msg.appendChild(b); }
    }
    function paint() {
        const r = R || { imgs: [] }, has = r.imgs && r.imgs.length;
        const mode = store().opt.chip || 'all';
        const showRow = mode === 'all' || (mode === 'last' && isLast()) || has || r.busy;
        root.hidden = !(showRow || has);
        q('.kdr-row').hidden = !showRow;
        stb.textContent = '· ' + (P ? String(P.sname || 'стиль').replace(/\s*\(.*?\)\s*/g, ' ').trim() : 'стиль');
        q('.kdr-pic').hidden = !has;
        if (has) {
            const k = Math.max(0, Math.min(r.i || 0, r.imgs.length - 1)), im = r.imgs[k];
            if (img.getAttribute('data-p') !== im.p) { img.setAttribute('data-p', im.p); img.src = im.p; }
            q('.kdr-n').textContent = r.imgs.length > 1 ? (k + 1) + ' / ' + r.imgs.length : '';
            q('[data-a=prev]').hidden = q('[data-a=next]').hidden = r.imgs.length < 2;
            q('.kdr-badge').textContent = (im.st || '') + (im.ms ? ' · ' + sec(im.ms) : '') + (im.rm ? ' · ⚠ временная ссылка провайдера' : '');
        }
        if (r.busy) { chip.classList.add('busy'); cl.textContent = 'снимаем · ' + sec(Date.now() - r.busy); showMsg(''); }
        else { chip.classList.remove('busy'); cl.textContent = has ? 'Ещё кадр' : 'Кадр'; if (r.err) showMsg('Не вышло: ' + r.err, true, true); else showMsg(''); }
    }
    function watch() {
        clearInterval(tick); clearTimeout(poll);
        if (R && R.busy) {
            tick = setInterval(() => { if (!R || !R.busy) return clearInterval(tick); cl.textContent = 'снимаем · ' + sec(Date.now() - R.busy); }, 1000);
            poll = setTimeout(() => { K.rec(id).then(r => { R = r; if (!r.busy) { clearInterval(tick); paint(); } else watch(); }); }, 2500);
        }
    }
    function load() {
        return Promise.all([K.rec(id), K.prefs()]).then(([r, p]) => {
            R = r; P = p;
            if (R.busy && Date.now() - R.busy > 6 * 60000) { R.busy = 0; R.err = 'зависло — попробуй ещё раз'; K.setRec(id, R); }
            paint(); watch();
        }).catch(() => { root.hidden = true; });
    }
    function go(wh) {
        if (R && R.busy) return;
        R = R || { imgs: [] }; R.busy = Date.now(); R.err = ''; paint(); watch();
        K.draw(id, { whisper: wh || '' }).then(r => { R = r; clearInterval(tick); paint(); });
    }
    root.addEventListener('click', e => {
        const b = e.target.closest('[data-a]'); if (!b || !root.contains(b)) return;
        const a = b.getAttribute('data-a');
        if (a === 'go') go();
        else if (a === 'wh') { wbox.hidden = !wbox.hidden; if (!wbox.hidden) setTimeout(() => inp.focus(), 30); }
        else if (a === 'shoot') { const w = inp.value.trim(); wbox.hidden = true; inp.value = ''; go(w); }
        else if (a === 'prev' || a === 'next') { const n = R.imgs.length; R.i = ((R.i || 0) + (a === 'next' ? 1 : -1) + n) % n; K.setRec(id, R); paint(); }
        else if (a === 'del') K.dropImg(id, R.i || 0).then(r => { R = r; paint(); });
        else if (a === 'dl') { const p = img.getAttribute('data-p'); if (p) { const l = document.createElement('a'); l.href = p; l.download = 'kadr_' + Date.now() + '.png'; document.body.appendChild(l); l.click(); l.remove(); } }
        else if (a === 'sty') pickStyle(stb).then(np => { if (np) { P = np; paint(); } });
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); q('[data-a=shoot]').click(); } });
    img.addEventListener('click', () => preview(img.src));
    const api = { id, root, load, go, paint };
    strips.set(id, api);
    const anchor = mesEl.querySelector('.mes_text');
    if (anchor) anchor.after(root); else mesEl.querySelector('.mes_block')?.appendChild(root);
    load();
    return api;
}

function scan() {
    const chat = ctx().chat || [];
    document.querySelectorAll('#chat .mes').forEach(el => {
        const i = Number(el.getAttribute('mesid'));
        if (!Number.isFinite(i) || !chat[i]) return;
        if (el.getAttribute('is_user') === 'true' || chat[i].is_user || chat[i].is_system) { el.querySelector('.kdr-s')?.remove(); return; }
        const id = idOf(i);
        const old = el.querySelector('.kdr-s');
        if (old && old.dataset.kid === id) return;
        if (old) old.remove();
        makeStrip(el, i);
    });
    for (const [id, s] of strips) if (!document.body.contains(s.root)) strips.delete(id);
}
function refreshAll() { for (const s of strips.values()) s.load(); }

/* ---------- выбор стиля (меню у кнопки) ---------- */
function closeMenu() { document.querySelector('.kdr-menu')?.remove(); }
function pickStyle(anchor) {
    return K.prefs().then(p => new Promise(res => {
        closeMenu();
        const menu = document.createElement('div');
        menu.className = 'kdr-menu';
        const favs = K.favs(p);
        const items = favs.map(f => ({ id: f.id, n: f.n, tx: f.tx, pg: f.pg }));
        if (!items.some(f => f.id === p.style)) items.unshift({ id: p.style, n: p.sname, tx: p.stext, pg: p.page, cur: 1 });
        items.forEach(f => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = (f.id === p.style ? '✓ ' : '') + f.n;
            b.onclick = () => { closeMenu(); if (f.cur) return res(null); K.setStyle({ style: f.id, sname: f.n, stext: f.tx, page: f.pg }).then(np => { syncPanel(); res(np); }); };
            menu.appendChild(b);
        });
        const more = document.createElement('button');
        more.type = 'button'; more.className = 'kdr-more'; more.textContent = 'Все стили — в настройках расширения «Кадр Мяфли»';
        more.onclick = () => { closeMenu(); openPanel(); res(null); };
        menu.appendChild(more);
        document.body.appendChild(menu);
        const r = anchor.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8)) + 'px';
        const top = r.bottom + 4;
        menu.style.top = (top + menu.offsetHeight > innerHeight - 8 ? Math.max(8, r.top - menu.offsetHeight - 4) : top) + 'px';
        setTimeout(() => document.addEventListener('click', function off(e) { if (!menu.contains(e.target)) { closeMenu(); document.removeEventListener('click', off, true); res(null); } }, true), 0);
    }));
}

function preview(src) {
    const o = document.createElement('div');
    o.className = 'kdr-view';
    o.innerHTML = '<img alt="">';
    o.querySelector('img').src = src;
    o.onclick = () => o.remove();
    document.body.appendChild(o);
}

/* ---------- панель настроек ---------- */
const AR = ['2:3', '3:4', '1:1', '4:3', '16:9', '9:16'];
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function panelHtml() {
    const groups = { base: 'Рисунок', mg: 'Манга · комиксы', ph: 'Фото и реализм' };
    let opts = '';
    for (const g of Object.keys(groups)) {
        const list = K.styles.filter(s => s[2] === g);
        if (!list.length) continue;
        opts += `<optgroup label="${groups[g]}">` + list.map(s => `<option value="${esc(s[0])}">${esc(s[1])}</option>`).join('') + '</optgroup>';
    }
    const rest = K.styles.filter(s => !groups[s[2]]);
    if (rest.length) opts += '<optgroup label="Ещё">' + rest.map(s => `<option value="${esc(s[0])}">${esc(s[1])}</option>`).join('') + '</optgroup>';
    if (LIB.length) {
        const byG = {};
        LIB.forEach((s, i) => { (byG[s[1]] ??= []).push(`<option value="lib:${i}">${esc(s[0])}</option>`); });
        for (const g in byG) opts += `<optgroup label="SLAY · ${esc(g)}">` + byG[g].join('') + '</optgroup>';
    }
    opts += '<optgroup label="Свои" id="kdr_own_g"></optgroup>';
    return `
<div class="kadr-settings">
 <div class="inline-drawer">
  <div class="inline-drawer-toggle inline-drawer-header"><b>🎞 Кадр Мяфли</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
  <div class="inline-drawer-content">
   <div class="kdr-tabs"><button type="button" data-t="st" class="on">Стиль</button><button type="button" data-t="hero">Герои</button><button type="button" data-t="prov">Провайдер</button></div>

   <div class="kdr-tab" data-t="st">
    <label>Стиль кадра</label>
    <select id="kdr_style" class="text_pole">${opts}</select>
    <small id="kdr_style_tx" class="kdr-hint"></small>
    <div class="kdr-line"><label class="checkbox_label"><input type="checkbox" id="kdr_fav"> в избранное (быстрый выбор под сообщением)</label></div>
    <details class="kdr-own"><summary>➕ Свой стиль</summary>
     <input id="kdr_own_n" class="text_pole" placeholder="Название">
     <textarea id="kdr_own_t" class="text_pole" rows="4" placeholder="Описание стиля на английском: как выглядит картинка"></textarea>
     <label class="checkbox_label"><input type="checkbox" id="kdr_own_pg"> страница с репликами (облачка с текстом)</label>
     <div class="menu_button" id="kdr_own_add">Добавить стиль</div>
    </details>
    <div class="kdr-grid">
     <label>Формат<select id="kdr_ar" class="text_pole">${AR.map(a => `<option>${a}</option>`).join('')}</select></label>
     <label>Скорость<select id="kdr_speed" class="text_pole"><option value="flash">⚡ Молния</option><option value="fast">🚀 Быстро</option><option value="smart">🧠 Умно</option></select></label>
     <label>Качество<select id="kdr_qual" class="text_pole"><option value="fast">быстро</option><option value="norm">норм</option><option value="max">макс</option></select></label>
     <label>Реплики<select id="kdr_lines" class="text_pole"><option value="auto">по стилю</option><option value="on">всегда</option><option value="off">без реплик</option></select></label>
    </div>
    <small class="kdr-hint">⚡ Молния — сразу из текста, без фото героев. 🚀 Быстро — с фото героев. 🧠 Умно — сначала текстовая модель пишет сцену.</small>
    <label class="checkbox_label"><input type="checkbox" id="kdr_refs"> отправлять фото героев как референс</label>
    <label class="checkbox_label"><input type="checkbox" id="kdr_auto"> рисовать сам после каждого ответа</label>
    <label>Кнопка «Кадр»<select id="kdr_chip" class="text_pole"><option value="all">под всеми ответами</option><option value="last">только под последним</option></select></label>
   </div>

   <div class="kdr-tab" data-t="hero" hidden>
    <small class="kdr-hint">Фото даёт лицо, описание — внешность. Пиши в описании только то, что есть, без слов «не»: «NOT MAN» рисовалка читает наоборот.</small>
    <div id="kdr_heroes"></div>
    <div class="kdr-line"><input id="kdr_npc_n" class="text_pole" placeholder="Имя второстепенного героя"><div class="menu_button" id="kdr_npc_add">+ герой</div></div>
   </div>

   <div class="kdr-tab" data-t="prov" hidden>
    <label>Картинки: адрес провайдера</label><input id="kdr_pUrl" class="text_pole" placeholder="https://…/v1">
    <label>Ключ</label><input id="kdr_pKey" class="text_pole" type="password" autocomplete="off">
    <label>Модель картинок</label><input id="kdr_pModel" class="text_pole" placeholder="gpt-image-1, gemini-2.5-flash-image…">
    <label>Тип запроса<select id="kdr_pApi" class="text_pole"><option value="auto">сам угадает</option><option value="images">/images (gpt-image и т.п.)</option><option value="chat">/chat (Gemini, Nano Banana)</option></select></label>
    <details><summary>Текстовая модель для «Умно» (необязательно)</summary>
     <small class="kdr-hint">Если пусто — сцену пишет модель, подключённая в SillyTavern.</small>
     <input id="kdr_tUrl" class="text_pole" placeholder="адрес (пусто = тот же, что для картинок)">
     <input id="kdr_tKey" class="text_pole" type="password" placeholder="ключ (пусто = тот же)" autocomplete="off">
     <input id="kdr_tModel" class="text_pole" placeholder="модель">
    </details>
    <div class="menu_button" id="kdr_save_prov">Сохранить</div>
    <small class="kdr-hint">Ключ хранится только в настройках твоего SillyTavern и уходит только на адрес провайдера.</small>
   </div>
   <small class="kdr-hint kdr-cred">Кадр Мяфли · @vika_myaflay · стили SLAY — Wewwa</small>
  </div>
 </div>
</div>`;
}

function styleFromValue(v) {
    if (v.startsWith('lib:')) { const s = LIB[Number(v.slice(4))]; return s ? { style: v, sname: s[0], stext: s[2], page: 0 } : null; }
    if (v.startsWith('own:')) { const s = (store().own || []).find(x => x.id === v); return s ? { style: s.id, sname: s.n, stext: s.tx, page: s.pg ? 1 : 0 } : null; }
    const s = K.byId(v); return s ? { style: s[0], sname: s[1], stext: s[4], page: s[3] } : null;
}
function fillOwn() {
    const g = document.getElementById('kdr_own_g'); if (!g) return;
    g.innerHTML = (store().own || []).map(s => `<option value="${esc(s.id)}">${esc(s.n)}</option>`).join('');
}
async function syncPanel() {
    const box = document.querySelector('.kadr-settings'); if (!box) return;
    fillOwn();
    const p = await K.prefs();
    const sel = box.querySelector('#kdr_style');
    if (![...sel.options].some(o => o.value === p.style)) { const o = new Option(p.sname || p.style, p.style); sel.prepend(o); }
    sel.value = p.style;
    box.querySelector('#kdr_style_tx').textContent = String(p.stext || '').slice(0, 260) + (String(p.stext || '').length > 260 ? '…' : '');
    box.querySelector('#kdr_fav').checked = (p.fav || []).some(f => (f && f.id ? f.id : f) === p.style);
    box.querySelector('#kdr_ar').value = p.ar || '2:3';
    box.querySelector('#kdr_speed').value = p.speed || 'fast';
    box.querySelector('#kdr_qual').value = p.qual || 'norm';
    box.querySelector('#kdr_lines').value = p.lines || 'auto';
    box.querySelector('#kdr_refs').checked = p.refs !== false;
    box.querySelector('#kdr_auto').checked = !!p.auto;
    box.querySelector('#kdr_chip').value = store().opt.chip || 'all';
    const c = await K.ready();
    ['pUrl', 'pKey', 'pModel', 'tUrl', 'tKey', 'tModel'].forEach(k => { box.querySelector('#kdr_' + k).value = c[k] || ''; });
    box.querySelector('#kdr_pApi').value = c.pApi || 'auto';
}
async function setPref(k, v) { const p = await K.prefs(); p[k] = v; await K.savePrefs(p); refreshAll(); }

async function renderHeroes() {
    const wrap = document.getElementById('kdr_heroes'); if (!wrap) return;
    wrap.innerHTML = '<small class="kdr-hint">загружаю…</small>';
    let cs = [];
    try { cs = await K.cast(); } catch { /* */ }
    wrap.innerHTML = cs.length ? '' : '<small class="kdr-hint">Открой чат с персонажем — тут появятся он и твоя персона.</small>';
    cs.forEach(h => {
        const role = { char: 'персонаж', user: 'ты', npc: 'второстепенный' }[h.role] || '';
        const card = el('div', 'kdr-hero');
        card.innerHTML = `
<div class="kdr-hhead"><b>${esc(h.n)}</b> <small>${role}</small>${h.role === 'npc' ? '<button type="button" class="kdr-x" title="убрать">✕</button>' : ''}</div>
<div class="kdr-refs"></div>
<label class="checkbox_label kdr-ava"${h.avatar ? '' : ' hidden'}><input type="checkbox"${h.ava !== false ? ' checked' : ''}> брать аватарку как фото</label>
<div class="kdr-line"><div class="menu_button kdr-addref">+ фото</div><input type="file" accept="image/*" hidden></div>
<textarea class="text_pole kdr-look" rows="3" placeholder="Внешность на английском: пол, возраст, волосы, глаза, приметы">${esc(h.look)}</textarea>
${h.desc ? '<div class="menu_button kdr-fromcard">✨ взять из карточки</div>' : ''}
<label>Одежда<select class="text_pole kdr-om"><option value="scene">по сюжету</option><option value="fixed">своя, всегда</option><option value="photo">как на фото</option></select></label>
<textarea class="text_pole kdr-of" rows="2" placeholder="Одежда (для «своя, всегда»)"${h.om === 'fixed' ? '' : ' hidden'}>${esc(h.of)}</textarea>
<input class="text_pole kdr-al" placeholder="ещё зовут: прозвища через запятую" value="${esc(h.al)}">
<div class="menu_button kdr-savehero">Сохранить героя</div>`;
        const refs = (h.refs || []).slice();
        const refBox = card.querySelector('.kdr-refs');
        const drawRefs = () => {
            refBox.innerHTML = '';
            if (h.avatar && card.querySelector('.kdr-ava input').checked && !refs.length) { const i = el('img'); i.src = h.avatar; i.title = 'аватарка'; refBox.appendChild(i); }
            refs.forEach((r, k) => { const d = el('span', 'kdr-ref'); const i = el('img'); i.src = r.p; const x = el('button', '', '✕'); x.type = 'button'; x.onclick = () => { refs.splice(k, 1); drawRefs(); }; d.append(i, x); refBox.appendChild(d); });
        };
        drawRefs();
        card.querySelector('.kdr-ava input').onchange = drawRefs;
        const om = card.querySelector('.kdr-om'); om.value = h.om || 'scene';
        om.onchange = () => { card.querySelector('.kdr-of').hidden = om.value !== 'fixed'; };
        const fi = card.querySelector('input[type=file]');
        card.querySelector('.kdr-addref').onclick = () => fi.click();
        fi.onchange = async () => {
            const f = fi.files?.[0]; if (!f) return;
            try {
                const d = await blobToDataUrl(f);
                const path = await fileApi.save('kadr_ref_' + hashN(h.k) + '_' + Date.now() + '.png', d, {});
                if (path) { refs.push({ p: path }); drawRefs(); toastr.success('Фото добавлено, не забудь «Сохранить героя»', 'Кадр'); }
            } catch (e) { toastr.error(String(e.message || e), 'Кадр'); }
            fi.value = '';
        };
        card.querySelector('.kdr-fromcard')?.addEventListener('click', async e => {
            const b = e.currentTarget; b.textContent = '✨ читаю карточку…';
            try { card.querySelector('.kdr-look').value = await K.lookFromCard(h); } catch (er) { toastr.error(String(er.message || er), 'Кадр'); }
            b.textContent = '✨ взять из карточки';
        });
        card.querySelector('.kdr-savehero').onclick = async () => {
            await K.saveHero({ k: h.k, n: h.n, al: card.querySelector('.kdr-al').value.trim(), look: card.querySelector('.kdr-look').value.trim(), refs, ava: card.querySelector('.kdr-ava input').checked, om: om.value, of: card.querySelector('.kdr-of').value.trim() });
            toastr.success('Герой сохранён', 'Кадр');
        };
        card.querySelector('.kdr-x')?.addEventListener('click', async () => { await K.delHero(h.k); renderHeroes(); });
        wrap.appendChild(card);
    });
}

function bindPanel() {
    const box = document.querySelector('.kadr-settings');
    box.querySelector('.kdr-tabs').addEventListener('click', e => {
        const b = e.target.closest('button[data-t]'); if (!b) return;
        box.querySelectorAll('.kdr-tabs button').forEach(x => x.classList.toggle('on', x === b));
        box.querySelectorAll('.kdr-tab').forEach(t => { t.hidden = t.dataset.t !== b.dataset.t; });
        if (b.dataset.t === 'hero') renderHeroes();
    });
    box.querySelector('#kdr_style').onchange = async e => {
        const st = styleFromValue(e.target.value); if (!st) return;
        await K.setStyle(st); syncPanel(); refreshAll();
    };
    box.querySelector('#kdr_fav').onchange = async e => {
        const p = await K.prefs();
        let fav = (p.fav || []).filter(f => (f && f.id ? f.id : f) !== p.style);
        if (e.target.checked) fav.push(K.byId(p.style) ? p.style : { id: p.style, n: p.sname, pg: p.page, tx: p.stext });
        p.fav = fav; await K.savePrefs(p);
    };
    box.querySelector('#kdr_own_add').onclick = async () => {
        const n = box.querySelector('#kdr_own_n').value.trim(), tx = box.querySelector('#kdr_own_t').value.trim();
        if (!n || !tx) return toastr.warning('Нужны название и описание', 'Кадр');
        const s = store(); s.own ??= [];
        const id = 'own:' + hashN(n + Date.now());
        s.own.push({ id, n, tx, pg: box.querySelector('#kdr_own_pg').checked }); saveSt();
        box.querySelector('#kdr_own_n').value = ''; box.querySelector('#kdr_own_t').value = '';
        fillOwn(); await K.setStyle(styleFromValue(id)); syncPanel(); refreshAll();
        toastr.success('Стиль добавлен и выбран', 'Кадр');
    };
    box.querySelector('#kdr_ar').onchange = e => setPref('ar', e.target.value);
    box.querySelector('#kdr_speed').onchange = e => setPref('speed', e.target.value);
    box.querySelector('#kdr_qual').onchange = e => setPref('qual', e.target.value);
    box.querySelector('#kdr_lines').onchange = e => setPref('lines', e.target.value);
    box.querySelector('#kdr_refs').onchange = e => setPref('refs', e.target.checked);
    box.querySelector('#kdr_auto').onchange = e => setPref('auto', e.target.checked);
    box.querySelector('#kdr_chip').onchange = e => { store().opt.chip = e.target.value; saveSt(); refreshAll(); };
    box.querySelector('#kdr_save_prov').onclick = async () => {
        const c = Object.assign({}, await K.ready());
        ['pUrl', 'pKey', 'pModel', 'tUrl', 'tKey', 'tModel'].forEach(k => { c[k] = box.querySelector('#kdr_' + k).value.trim(); });
        c.pApi = box.querySelector('#kdr_pApi').value; c.src = 'prov';
        await K.saveCfg(c);
        toastr.success('Провайдер сохранён', 'Кадр');
    };
    box.querySelector('#kdr_npc_add').onclick = async () => {
        const n = box.querySelector('#kdr_npc_n').value.trim(); if (!n) return;
        await K.addNpc(n); box.querySelector('#kdr_npc_n').value = ''; renderHeroes();
    };
}
function openPanel() {
    const box = document.querySelector('.kadr-settings'); if (!box) return;
    document.getElementById('extensionsMenuButton');
    const drawer = document.querySelector('#extensions-settings-button .drawer-toggle, #extensions-settings-button');
    if (drawer && !document.querySelector('#rm_extensions_block.openDrawer')) drawer.click();
    const content = box.querySelector('.inline-drawer-content');
    if (content && getComputedStyle(content).display === 'none') box.querySelector('.inline-drawer-toggle')?.click();
    setTimeout(() => box.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
}

/* ---------- запуск ---------- */
async function init() {
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (host && !document.querySelector('.kadr-settings')) {
        const wrap = document.createElement('div');
        wrap.innerHTML = panelHtml();
        host.appendChild(wrap.firstElementChild);
        bindPanel();
    }
    const c = await K.ready();
    if (!c.src) { c.src = 'prov'; await K.saveCfg(c); }
    syncPanel();
    const { eventSource, event_types: E } = ctx();
    const later = () => setTimeout(scan, 60);
    [E.CHAT_CHANGED, E.CHARACTER_MESSAGE_RENDERED, E.USER_MESSAGE_RENDERED, E.MESSAGE_SWIPED, E.MESSAGE_UPDATED, E.MESSAGE_DELETED, E.MORE_MESSAGES_LOADED, E.MESSAGE_EDITED]
        .filter(Boolean).forEach(ev => eventSource.on(ev, later));
    eventSource.on(E.CHAT_CHANGED, () => { syncPanel(); const t = document.querySelector('.kadr-settings .kdr-tabs .on'); if (t?.dataset.t === 'hero') renderHeroes(); });
    if (E.CHARACTER_MESSAGE_RENDERED) eventSource.on(E.CHARACTER_MESSAGE_RENDERED, async i => {
        const p = await K.prefs();
        if (!p.auto) return;
        const idx = Number(i);
        if (!Number.isFinite(idx) || idx !== (ctx().chat || []).length - 1) return;
        setTimeout(() => { const s = strips.get(idOf(idx)); if (s) s.go(); }, 400);
    });
    K.sub((p, id) => { if (p) for (const s of strips.values()) s.load(); else if (id) strips.get(String(id))?.load(); });
    scan();
}

jQuery(() => { init().catch(e => console.error('[Кадр Мяфли]', e)); });

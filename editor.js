// Editor for the bio page: edits config.js, previews it live and publishes it to GitHub.

const LINK_TYPES = [
  ['discord', 'Discord'],
  ['x', 'X / Twitter'],
  ['instagram', 'Instagram'],
  ['tiktok', 'TikTok'],
  ['youtube', 'YouTube'],
  ['github', 'GitHub'],
  ['twitch', 'Twitch'],
  ['spotify', 'Spotify'],
  ['link', 'Outro link']
];

const MAX_FILE_MB = 95;     // GitHub refuses files over 100 MB
const WARN_FILE_MB = 25;

const $ = id => document.getElementById(id);

let cfg = normalizeConfig(window.BIO_CONFIG || {});
const pending = { avatar: null, background: null, music: null };   // File objects not yet published
const objectUrls = {};

function normalizeConfig(c) {
  return {
    name: c.name || '',
    bio: Array.isArray(c.bio) ? c.bio.slice() : (c.bio ? [String(c.bio)] : []),
    startText: c.startText || '',
    avatar: c.avatar || '',
    background: c.background || '',
    backgroundType: c.backgroundType || '',
    music: c.music || '',
    links: Array.isArray(c.links) ? c.links.map(l => ({ type: l.type || 'link', value: l.value || '' })) : []
  };
}

function configToJs(c) {
  const out = { ...c };
  if (!out.backgroundType) delete out.backgroundType;
  out.links = out.links.filter(l => l.value.trim());
  out.bio = out.bio.filter(line => line.trim());
  return `window.BIO_CONFIG = ${JSON.stringify(out, null, 2)};\n`;
}

function parseConfigJs(text) {
  const json = text.replace(/^\s*window\.BIO_CONFIG\s*=\s*/, '').replace(/;\s*$/, '');
  return JSON.parse(json);
}

// ----- Form <-> state -----

function fileLabel(path) {
  return path ? path.split('/').pop() : 'nenhum arquivo';
}

function mediaUrl(kind) {
  return pending[kind] ? objectUrls[kind] : cfg[kind];
}

function isVideo(kind) {
  if (kind !== 'background') return false;
  if (pending.background) return pending.background.type.startsWith('video');
  if (cfg.backgroundType) return cfg.backgroundType === 'video';
  return /\.(mp4|webm|mov)$/i.test(cfg.background);
}

function renderMedia() {
  $('avatar-thumb').src = mediaUrl('avatar') || '';
  $('avatar-name').textContent = pending.avatar ? `${pending.avatar.name} (novo)` : fileLabel(cfg.avatar);

  const bgThumb = $('bg-thumb');
  bgThumb.innerHTML = '';
  const bgUrl = mediaUrl('background');
  if (bgUrl) {
    const el = document.createElement(isVideo('background') ? 'video' : 'img');
    el.src = bgUrl;
    el.className = 'thumb';
    el.style.border = 'none';
    if (el.tagName === 'VIDEO') { el.muted = true; el.autoplay = true; el.loop = true; el.playsInline = true; }
    bgThumb.appendChild(el);
  }
  $('bg-name').textContent = pending.background ? `${pending.background.name} (novo)` : fileLabel(cfg.background);

  const player = $('music-player');
  const musicUrl = mediaUrl('music') || '';
  if (player.getAttribute('src') !== musicUrl) player.src = musicUrl;
  $('music-name').textContent = pending.music ? `${pending.music.name} (novo)` : fileLabel(cfg.music);
}

function renderLinks() {
  const list = $('links');
  list.innerHTML = '';
  cfg.links.forEach((link, i) => {
    const row = document.createElement('div');
    row.className = 'link-row';

    const select = document.createElement('select');
    LINK_TYPES.forEach(([value, label]) => select.add(new Option(label, value, false, value === link.type)));
    select.addEventListener('change', () => { link.type = select.value; schedulePreview(); });

    const input = document.createElement('input');
    input.type = 'text';
    input.value = link.value;
    input.placeholder = link.type === 'discord' ? 'nome de usuário ou link' : 'https://…';
    input.addEventListener('input', () => { link.value = input.value.trim(); schedulePreview(); });

    const actions = document.createElement('div');
    actions.className = 'link-actions';
    const btn = (text, title, onClick, extra = '') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `icon ${extra}`;
      b.textContent = text;
      b.title = title;
      b.addEventListener('click', onClick);
      actions.appendChild(b);
      return b;
    };
    btn('↑', 'Mover para cima', () => moveLink(i, -1)).disabled = i === 0;
    btn('↓', 'Mover para baixo', () => moveLink(i, 1)).disabled = i === cfg.links.length - 1;
    btn('✕', 'Remover', () => { cfg.links.splice(i, 1); renderLinks(); schedulePreview(); }, 'danger');

    row.append(select, input, actions);
    list.appendChild(row);
  });
}

function moveLink(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= cfg.links.length) return;
  [cfg.links[i], cfg.links[j]] = [cfg.links[j], cfg.links[i]];
  renderLinks();
  schedulePreview();
}

function fillForm() {
  $('f-name').value = cfg.name;
  $('f-bio').value = cfg.bio.join('\n');
  $('f-start').value = cfg.startText;
  renderMedia();
  renderLinks();
}

$('f-name').addEventListener('input', e => { cfg.name = e.target.value; schedulePreview(); });
$('f-bio').addEventListener('input', e => { cfg.bio = e.target.value.split('\n'); schedulePreview(); });
$('f-start').addEventListener('input', e => { cfg.startText = e.target.value; schedulePreview(); });

$('add-link').addEventListener('click', () => {
  cfg.links.push({ type: 'instagram', value: '' });
  renderLinks();
  const inputs = $('links').querySelectorAll('input');
  inputs[inputs.length - 1].focus();
});

function pickFile(kind, inputId) {
  $(inputId).addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const mb = file.size / 1024 / 1024;
    if (mb > MAX_FILE_MB) {
      showStatus(`"${file.name}" tem ${mb.toFixed(0)} MB. O GitHub aceita no máximo 100 MB por arquivo; use um arquivo menor.`, 'error');
      return;
    }
    if (mb > WARN_FILE_MB) {
      showStatus(`"${file.name}" tem ${mb.toFixed(0)} MB. Funciona, mas o site vai demorar mais para carregar.`);
    }
    if (objectUrls[kind]) URL.revokeObjectURL(objectUrls[kind]);
    pending[kind] = file;
    objectUrls[kind] = URL.createObjectURL(file);
    renderMedia();
    refreshPreview();
  });
}

pickFile('avatar', 'f-avatar');
pickFile('background', 'f-bg');
pickFile('music', 'f-music');

// ----- Live preview: index.html?preview reads window.parent.BIO_PREVIEW_CONFIG -----

let previewTimer = null;

function previewConfig() {
  const c = normalizeConfig(cfg);
  ['avatar', 'background', 'music'].forEach(kind => { if (pending[kind]) c[kind] = objectUrls[kind]; });
  c.backgroundType = isVideo('background') ? 'video' : 'image';
  c.bio = c.bio.filter(line => line.trim());
  return c;
}

function refreshPreview() {
  clearTimeout(previewTimer);
  window.BIO_PREVIEW_CONFIG = previewConfig();
  $('preview').src = `index.html?preview=${Date.now()}`;
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, 700);
}

$('reload-preview').addEventListener('click', refreshPreview);

// Render the site at desktop width (or its own width, if wider) and scale it to the frame.
const PREVIEW_WIDTH = 1024;

function fitPreview() {
  const frame = $('preview-frame');
  const { width, height } = frame.getBoundingClientRect();
  if (!width || !height) return;
  const scale = Math.min(1, width / PREVIEW_WIDTH);
  const iframe = $('preview');
  iframe.style.width = `${width / scale}px`;
  iframe.style.height = `${height / scale}px`;
  iframe.style.transform = `scale(${scale})`;
}

new ResizeObserver(fitPreview).observe($('preview-frame'));
fitPreview();

// ----- Publishing to GitHub (Git Data API: one commit with every changed file) -----

function showStatus(message, kind = '') {
  const el = $('status');
  el.className = `publish-status show ${kind}`;
  el.innerHTML = '';
  el.append(message);
}

function guessRepo() {
  const host = location.hostname;
  if (host.endsWith('.github.io')) {
    const owner = host.split('.')[0];
    const first = location.pathname.split('/').filter(Boolean)[0];
    return first && !first.endsWith('.html') ? `${owner}/${first}` : `${owner}/${host}`;
  }
  return '';
}

function storageGet(store, key) {
  try { return window[store].getItem(key) || ''; } catch (e) { return ''; }
}

function storageSet(store, key, value) {
  try { value ? window[store].setItem(key, value) : window[store].removeItem(key); } catch (e) {}
}

$('f-repo').value = storageGet('localStorage', 'bioEditorRepo') || guessRepo();
$('f-token').value = storageGet('localStorage', 'bioEditorToken') || storageGet('sessionStorage', 'bioEditorToken');
$('f-remember').checked = !!storageGet('localStorage', 'bioEditorToken');

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function extensionOf(file) {
  const fromName = (file.name.match(/\.([a-z0-9]{2,5})$/i) || [])[1];
  if (fromName) return fromName.toLowerCase();
  return (file.type.split('/')[1] || 'bin').replace('mpeg', 'mp3').replace('jpeg', 'jpg');
}

function friendlyError(status, message) {
  if (status === 401) return 'Token inválido ou expirado. Gere um novo token e cole aqui.';
  if (status === 403) return 'O token não tem permissão para escrever. Ele precisa de "Contents: Read and write" neste repositório.';
  if (status === 404) return 'Repositório não encontrado, ou o token não tem acesso a ele. Confira o nome (usuário/repositório).';
  if (status === 409 || status === 422) return `O GitHub recusou a alteração (${message}). Tente publicar de novo.`;
  return `Erro ${status}: ${message}`;
}

async function publish() {
  const repo = $('f-repo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$|\/$/g, '');
  const token = $('f-token').value.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return showStatus('Preencha o repositório no formato usuário/repositório.', 'error');
  if (!token) return showStatus('Cole um token do GitHub para publicar (veja "Como criar o token").', 'error');

  storageSet('localStorage', 'bioEditorRepo', repo);
  storageSet('localStorage', 'bioEditorToken', $('f-remember').checked ? token : '');
  storageSet('sessionStorage', 'bioEditorToken', token);

  const gh = async (path, options = {}) => {
    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(friendlyError(res.status, data.message || res.statusText));
    return data;
  };

  const button = $('publish');
  button.disabled = true;
  try {
    showStatus('Conectando ao GitHub…');
    const info = await gh('');
    const branch = info.default_branch;
    const ref = await gh(`/git/ref/heads/${encodeURIComponent(branch)}`);
    const head = await gh(`/git/commits/${ref.object.sha}`);

    const next = normalizeConfig(cfg);
    const tree = [];
    const stamp = Date.now();
    for (const kind of ['avatar', 'background', 'music']) {
      const file = pending[kind];
      if (!file) continue;
      showStatus(`Enviando ${file.name}…`);
      const blob = await gh('/git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content: await fileToBase64(file), encoding: 'base64' })
      });
      const path = `assets/${kind}-${stamp}.${extensionOf(file)}`;
      tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
      next[kind] = path;
      if (kind === 'background') next.backgroundType = file.type.startsWith('video') ? 'video' : 'image';
    }
    tree.push({ path: 'config.js', mode: '100644', type: 'blob', content: configToJs(next) });

    showStatus('Salvando…');
    const newTree = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
    const commit = await gh('/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message: 'Atualiza a bio pelo editor', tree: newTree.sha, parents: [ref.object.sha] })
    });
    await gh(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });

    // Published: the repo paths replace the local files.
    cfg = next;
    ['avatar', 'background', 'music'].forEach(kind => { pending[kind] = null; });
    renderMedia();

    const el = $('status');
    el.className = 'publish-status show ok';
    el.innerHTML = '';
    el.append('Publicado! O site atualiza em 1 a 2 minutos. ');
    const a = document.createElement('a');
    a.href = './';
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Abrir o site';
    el.append(a);
  } catch (err) {
    showStatus(err.message || String(err), 'error');
  } finally {
    button.disabled = false;
  }
}

$('publish').addEventListener('click', publish);

$('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([configToJs(cfg)], { type: 'text/javascript' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'config.js';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  if (pending.avatar || pending.background || pending.music) {
    showStatus('Atenção: o config.js baixado não inclui os arquivos novos de foto, fundo ou música. Para enviá-los, use "Publicar no GitHub".');
  }
});

// ----- Start: show what's in config.js, then fetch the newest copy (Pages caches it for a few minutes) -----

fillForm();
refreshPreview();

fetch(`config.js?v=${Date.now()}`, { cache: 'no-store' })
  .then(res => res.ok ? res.text() : Promise.reject())
  .then(text => {
    const fresh = normalizeConfig(parseConfigJs(text));
    if (JSON.stringify(fresh) !== JSON.stringify(normalizeConfig(window.BIO_CONFIG || {}))) {
      cfg = fresh;
      fillForm();
      refreshPreview();
    }
  })
  .catch(() => {});

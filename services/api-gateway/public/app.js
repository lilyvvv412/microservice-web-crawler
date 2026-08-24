const API = '/api/v1';

const els = {
  crawlForm: document.getElementById('crawl-form'),
  crawlUrl: document.getElementById('crawl-url'),
  crawlMsg: document.getElementById('crawl-msg'),
  crawlHint: document.getElementById('crawl-hint'),
  taskBox: document.getElementById('task-box'),
  taskId: document.getElementById('task-id'),
  taskStatus: document.getElementById('task-status'),
  searchForm: document.getElementById('search-form'),
  searchQ: document.getElementById('search-q'),
  searchResults: document.getElementById('search-results'),
  pageForm: document.getElementById('page-form'),
  pageUrl: document.getElementById('page-url'),
  pageSource: document.getElementById('page-source'),
  pageDetail: document.getElementById('page-detail'),
};

let token = sessionStorage.getItem('demoToken') || '';
let pollTimer = null;

async function ensureAuth() {
  if (token) return token;
  const res = await fetch(`${API}/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@local.dev', password: 'demo' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Login failed');
  token = data.token;
  sessionStorage.setItem('demoToken', token);
  return token;
}

function setStatus(status) {
  els.taskStatus.textContent = status;
  els.taskStatus.className = 'badge';
  if (status === 'completed') els.taskStatus.classList.add('ok');
  else if (status === 'failed') els.taskStatus.classList.add('err');
  else els.taskStatus.classList.add('warn');
}

async function pollStatus(taskId) {
  clearInterval(pollTimer);
  const tick = async () => {
    try {
      await ensureAuth();
      const res = await fetch(`${API}/crawl/${taskId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.message || data.error || 'unknown');
        return;
      }
      const status = data.data?.status || data.status || 'unknown';
      setStatus(status);
      if (status === 'processing') {
        els.crawlMsg.textContent =
          'Processing… (external sites may take up to ~30s; wrong hostnames stay stuck then fail)';
      }
      if (status === 'completed' || status === 'failed') {
        clearInterval(pollTimer);
        const err = data.data?.task?.error || data.data?.task?.lastError || 'see logs';
        els.crawlMsg.textContent =
          status === 'completed'
            ? 'Crawl finished. Try search below.'
            : `Crawl failed: ${err}`;
      }
    } catch (err) {
      els.crawlMsg.textContent = err.message;
    }
  };
  await tick();
  pollTimer = setInterval(tick, 1000);
}

els.crawlForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.crawlMsg.textContent = 'Scheduling…';
  try {
    await ensureAuth();
    const url = els.crawlUrl.value.trim();
    const res = await fetch(`${API}/crawl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url, depth: 1 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to schedule crawl');

    const taskId = data.taskId;
    els.taskBox.classList.remove('hidden');
    els.taskId.textContent = taskId;
    els.pageUrl.value = url;
    els.crawlMsg.textContent = 'Task queued. Polling status…';
    setStatus('queued');
    pollStatus(taskId);
  } catch (err) {
    els.crawlMsg.textContent = err.message;
  }
});

els.searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.searchResults.innerHTML = '<li>Searching…</li>';
  try {
    const q = els.searchQ.value.trim();
    const res = await fetch(`${API}/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Search failed');

    const list = data.data?.hits || [];

    if (!list.length) {
      els.searchResults.innerHTML = '<li>No results</li>';
      return;
    }

    els.searchResults.innerHTML = list
      .map((item) => `<li>
          <strong>${item.title || item.url || 'Untitled'}</strong>
          <div>${item.description || ''}</div>
          <small>${item.url || ''}</small>
        </li>`)
      .join('');
  } catch (err) {
    els.searchResults.innerHTML = `<li>${err.message}</li>`;
  }
});

els.pageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.pageDetail.textContent = 'Loading…';
  els.pageSource.textContent = '—';
  try {
    const url = els.pageUrl.value.trim();
    const res = await fetch(`${API}/data?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Load failed');

    const payload = data.data || data;
    const source = payload.source || 'unknown';
    els.pageSource.textContent = source;
    els.pageSource.className = 'badge ' + (source === 'cache' ? 'ok' : 'warn');
    els.pageDetail.textContent = JSON.stringify(payload.data || payload, null, 2);
  } catch (err) {
    els.pageDetail.textContent = err.message;
  }
});

async function initFixtureUrl() {
  let mode = 'compose';
  try {
    const res = await fetch(`${API}/health`);
    const data = await res.json();
    mode = data.deployMode || 'compose';
  } catch {
    // fall through
  }

  // PM2 apps run on the host: Extraction must fetch 127.0.0.1, not Docker DNS.
  // Compose apps run in Docker: Extraction must fetch http://api-gateway:...
  const fixture =
    mode === 'pm2'
      ? `${location.protocol}//127.0.0.1:${location.port || '3000'}/fixture/demo.html`
      : 'http://api-gateway:3000/fixture/demo.html';

  els.crawlUrl.value = fixture;
  els.pageUrl.value = fixture;
  if (els.crawlHint) {
    els.crawlHint.textContent =
      mode === 'pm2'
        ? 'PM2 mode: use http://127.0.0.1:3000/fixture/demo.html (api-gateway hostname will fail).'
        : 'Docker Compose mode: keep http://api-gateway:3000/fixture/demo.html (localhost will fail inside containers).';
  }
}

initFixtureUrl();

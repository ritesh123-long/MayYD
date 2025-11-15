// ================== CONFIG ==================
const SEARCH_API = 'https://maytmsapi.onrender.com/search';
const DOWNLOADER_BASE = 'https://88a114a8-1092-43f7-aa2e-391c2f3e4a2e-00-3jf34ufwuohjt.pike.replit.dev:3000';
// downloader expects path-style: /<quality>/id=<VIDEO_ID>

// ================== DOM refs (will be initialized on DOMContentLoaded) =
let qEl, goBtn, resultsEl, statsEl, loadingEl, errorEl, maxEl, sortEl, loadMoreBtn, toastEl;

let lastResults = [], lastCount = 0, lastQuery = '';

// ================== Helpers ==================
const fmtNumber = n => typeof n === 'number' ? n.toLocaleString() : (n || '0');
const safe = (obj, path, fallback='') => { try { return path.split('.').reduce((a,b)=>a && a[b], obj) || fallback } catch(e){ return fallback } };

function showToast(msg, timeout = 2200){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>toastEl.classList.remove('show'), timeout);
}
function showLoading(on=true){ if(on) loadingEl.classList.remove('hidden'); else loadingEl.classList.add('hidden'); }
function showError(msg){ errorEl.textContent = msg; errorEl.classList.remove('hidden'); showToast(msg, 2600); }
function clearError(){ errorEl.textContent = ''; errorEl.classList.add('hidden'); }

function buildDownloadUrl(videoId, quality='medium'){
  const base = DOWNLOADER_BASE.replace(/\/+$/,'');
  return `${base}/${quality}/id=${encodeURIComponent(videoId)}`;
}
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ================== Render card ==================
function renderCard(item){
  const id = item.id;
  const title = item.title || 'Untitled';
  const author = safe(item,'author.name','Unknown');
  const views = item.views || 0;
  const ts = item.timestamp || (item.seconds ? Math.floor(item.seconds/60)+':'+String(item.seconds%60).padStart(2,'0') : '—');
  const uploadedAt = item.uploadedAt || '';
  const thumb = item.thumbnail_hq || item.thumbnail || item.thumbnail_sd || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  const youtube = item.youtube_watch_url || item.youtube_url || `https://www.youtube.com/watch?v=${id}`;
  const ytmusic = item.youtube_music_url || `https://music.youtube.com/watch?v=${id}`;
  const short = item.youtube_short_url || `https://youtu.be/${id}`;

  const card = document.createElement('article');
  card.className = 'card';
  card.setAttribute('role','listitem');
  card.innerHTML = `
    <div class="thumb" aria-hidden="true"><img loading="lazy" src="${escapeHtml(thumb)}" alt="${escapeHtml(title)}"></div>
    <div class="meta">
      <h3 title="${escapeHtml(title)}">${escapeHtml(title)}</h3>
      <div class="sub">
        <div class="chip">${escapeHtml(author)}</div>
        <div class="chip">⏱ ${escapeHtml(ts)}</div>
        <div class="chip">👁 ${fmtNumber(views)}</div>
        ${uploadedAt ? `<div class="chip">${escapeHtml(uploadedAt)}</div>` : ''}
      </div>

      <div class="actions" style="margin-top:8px">
        <a class="link" href="${escapeHtml(ytmusic)}" target="_blank" rel="noopener">Music</a>
        <a class="link" href="${escapeHtml(youtube)}" target="_blank" rel="noopener">YouTube</a>
        <a class="link" href="${escapeHtml(short)}" target="_blank" rel="noopener">Short</a>
      </div>

      <div class="download-row" style="margin-top:10px">
        <select id="qsel-${id}" class="quality" aria-label="Select quality">
          <option value="high">High</option>
          <option value="medium" selected>Medium</option>
          <option value="low">Low</option>
        </select>

        <button id="dl-${id}" class="download-btn" aria-label="Download">
          <span id="dl-text-${id}">Download</span>
        </button>

        <button id="copy-${id}" class="copy-btn" aria-label="Copy link">Copy link</button>

        <div id="ld-${id}" style="display:none"><span class="loader-small" aria-hidden="true"></span></div>
      </div>
    </div>
  `;

  // handlers
  setTimeout(()=>{
    const sel = card.querySelector(`#qsel-${id}`);
    const dlBtn = card.querySelector(`#dl-${id}`);
    const dlText = card.querySelector(`#dl-text-${id}`);
    const copyBtn = card.querySelector(`#copy-${id}`);
    const loaderBox = card.querySelector(`#ld-${id}`);

    function setDownloading(on){
      if(on){
        dlBtn.setAttribute('disabled','true');
        dlText.textContent = 'Downloading…';
        loaderBox.style.display = 'inline-flex';
      } else {
        dlBtn.removeAttribute('disabled');
        dlText.textContent = 'Download';
        loaderBox.style.display = 'none';
      }
    }

    dlBtn.addEventListener('click', ()=>{
      const quality = sel.value || 'medium';
      const url = buildDownloadUrl(id, quality);
      setDownloading(true);
      showToast('Preparing download…');

      try {
        setTimeout(()=> {
          window.open(url, '_blank', 'noopener');
          showToast('Download opened in new tab');
        }, 300);
      } catch(e){
        showError('Unable to open download link. Try copy link.');
      }

      setTimeout(()=> setDownloading(false), 2200);
    });

    copyBtn.addEventListener('click', ()=>{
      const quality = sel.value || 'medium';
      const url = buildDownloadUrl(id, quality);
      navigator.clipboard?.writeText(url).then(()=> showToast('Download link copied')).catch(()=> showError('Copy failed'));
    });

  }, 0);

  return card;
}

// ================== Sorting ==================
function sortItems(items){
  const mode = sortEl.value;
  if(!mode) return items;
  const arr = Array.from(items);
  if(mode === 'views_desc') return arr.sort((a,b)=> (b.views||0)-(a.views||0));
  if(mode === 'views_asc') return arr.sort((a,b)=> (a.views||0)-(b.views||0));
  if(mode === 'duration_desc') return arr.sort((a,b)=> (b.seconds||0)-(a.seconds||0));
  if(mode === 'duration_asc') return arr.sort((a,b)=> (a.seconds||0)-(b.seconds||0));
  return arr;
}

// ================== Search ==================
async function doSearch(isLoadMore=false){
  clearError();
  const q = qEl.value.trim();
  if(!q){ showError('Please enter search text'); return; }
  let max = parseInt(maxEl.value,10) || 10;
  max = Math.min(50, Math.max(1, max));
  const reqMax = isLoadMore ? Math.min(50, lastCount + max) : max;
  showLoading(true);

  try {
    const url = new URL(SEARCH_API);
    url.searchParams.set('q', q);
    url.searchParams.set('maxResults', String(reqMax));

    const res = await fetch(url.toString(), { cache: 'no-store' });
    if(!res.ok) throw new Error('Search API error: ' + res.status);
    const json = await res.json();

    if(!json.ok || !Array.isArray(json.items)){
      showError('API returned unexpected format');
      return;
    }

    lastQuery = q;
    lastResults = json.items;
    lastCount = json.count || lastResults.length;

    const items = sortItems(lastResults);
    resultsEl.innerHTML = '';
    if(items.length === 0){
      resultsEl.innerHTML = `<div style="padding:14px;border-radius:8px;background:var(--glass);color:var(--muted)">No results found.</div>`;
    } else {
      const frag = document.createDocumentFragment();
      items.forEach(it => frag.appendChild(renderCard(it)));
      resultsEl.appendChild(frag);
    }

    statsEl.textContent = `Showing ${items.length} result(s) for "${q}"`;
    if(items.length < (json.count || items.length) && items.length < 50) loadMoreBtn.classList.remove('hidden'); else loadMoreBtn.classList.add('hidden');

  } catch(err){
    console.error(err);
    showError('Search failed: ' + (err.message || err));
  } finally {
    showLoading(false);
  }
}

// ================== Init & Events ==================
document.addEventListener('DOMContentLoaded', function(){
  // init DOM refs
  qEl = document.getElementById('q');
  goBtn = document.getElementById('go');
  resultsEl = document.getElementById('results');
  statsEl = document.getElementById('stats');
  loadingEl = document.getElementById('loading');
  errorEl = document.getElementById('error');
  maxEl = document.getElementById('maxResults');
  sortEl = document.getElementById('sort');
  loadMoreBtn = document.getElementById('loadMore');
  toastEl = document.getElementById('toast');

  // attach events
  goBtn.addEventListener('click', ()=>doSearch(false));
  qEl.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); doSearch(false); }});
  loadMoreBtn.addEventListener('click', ()=>doSearch(true));
  sortEl.addEventListener('change', ()=>{
    if(!lastResults) return;
    const items = sortItems(lastResults);
    resultsEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    items.forEach(it => frag.appendChild(renderCard(it)));
    resultsEl.appendChild(frag);
  });

  // focus
  qEl.focus();

  // optional: test quick search
  // qEl.value = 'arijit singh';
  // doSearch(false);
});

// Small helpers used in multiple places:
function clearError(){ if(errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); } }

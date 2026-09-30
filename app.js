// ============ CẤU HÌNH ============
const API_URL = 'https://script.google.com/macros/s/AKfycbyNsgSGcAqHXozITTRJKttOSWhG2yYSmYt9KXrQI0bw2CTBS0yCQApPQ_quviC50N2M/exec';
const DRIVE_FOLDER_ID = '10wMnomA-GMKu7VTFRSMyvvh7Zz-dTAfx';
const CLIENT_ID = '98709712620-nnajeb7oh59euiasptv0ljpi6r80v4ph.apps.googleusercontent.com';
// Scope đầy đủ: bắt buộc để upload vào folder cố định (drive.file sẽ 404)
const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
const FILE_TTL_MS = 5 * 60 * 60 * 1000; // khớp trigger tự xóa 5h bên Apps Script
const PARALLEL_ROUTES = 3;

// ============ STATE ============
const state = {
  accessToken: null, tokenExp: 0, user: null, files: [],
  lastResult: null, lastType: null,
  view: { activeRoute: 'all', activeFilter: 'all', searchText: '', shownCount: 0, totalCount: 0 }
};

let dropzone, fileInput, fileList, logEl, loading, loadingText, resultCard, resultTitle, resultContent, summaryEl;
let loginNotice, mainContent, userInfo, userAvatar, userName, btnLogout, btnGoogleLogin;
let resultsWorkspaceEl, noDataYetEl, lookupBarEl, searchInputEl, lookupMetaEl;
let statCardsEl, routeTabsEl, filterChipsEl, inputNgayDo, inputNguoiDo, copyBarEl;
let tokenClient = null;

// ============ TIỆN ÍCH ============
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function td(v, cls) { return '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(v) + '</td>'; }
function sortedKeys(routes) { return Object.keys(routes).sort(function(a, b) { return Number(a) - Number(b); }); }
function pad2(n) { return String(n).padStart(2, '0'); }
function todayInputValue() { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function formatDateVN(s) { const p = String(s).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function todayVN() { const d = new Date(); return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear(); }
function formatSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
function normalizeSearch(str) {
  return String(str == null ? '' : str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
}

// ============ LOG (textContent, không innerHTML) ============
function log(msg, type) {
  if (!logEl) { console.log(msg); return; }
  const line = document.createElement('div');
  const t = document.createElement('span'); t.className = 'log-time'; t.textContent = new Date().toLocaleTimeString('vi-VN');
  const m = document.createElement('span'); m.className = type === 'ok' ? 'log-ok' : type === 'err' ? 'log-err' : 'log-info'; m.textContent = msg;
  line.appendChild(t); line.appendChild(m);
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}
function showLoading(text) { if (!loading) return; loadingText.textContent = text || 'Đang xử lý...'; loading.style.display = 'flex'; }
function hideLoading() { if (loading) loading.style.display = 'none'; }

// ============ GOOGLE SIGN-IN ============
function initTokenClient() {
  if (tokenClient) return true;
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) return false;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: function(resp) {
      if (resp.error) { log('❌ Lỗi đăng nhập: ' + resp.error, 'err'); return; }
      if (!resp.access_token) { log('❌ Không nhận được access_token', 'err'); return; }
      state.accessToken = resp.access_token;
      state.tokenExp = Date.now() + ((Number(resp.expires_in) || 3600) - 60) * 1000;
      if (!state.user) fetchUserInfo(); else log('🔄 Đã làm mới phiên đăng nhập', 'ok');
    }
  });
  return true;
}

function ensureToken() {
  // trả về true nếu token còn hạn; nếu hết hạn thì mở lại popup và báo caller dừng
  if (state.accessToken && Date.now() < state.tokenExp) return true;
  log('⚠️ Phiên Google hết hạn, đang xin lại token. Thử lại sau khi đăng nhập xong.', 'err');
  if (tokenClient) { try { tokenClient.requestAccessToken({ prompt: '' }); } catch (e) { log('❌ ' + e.message, 'err'); } }
  return false;
}

window.onload = function() {
  const $ = function(id) { return document.getElementById(id); };
  dropzone = $('dropzone'); fileInput = $('fileInput'); fileList = $('fileList'); logEl = $('log');
  loading = $('loading'); loadingText = $('loadingText'); resultCard = $('resultCard'); resultTitle = $('resultTitle');
  resultContent = $('resultContent'); summaryEl = $('summary'); loginNotice = $('loginNotice'); mainContent = $('mainContent');
  userInfo = $('userInfo'); userAvatar = $('userAvatar'); userName = $('userName'); btnLogout = $('btnLogout');
  btnGoogleLogin = $('btnGoogleLogin'); resultsWorkspaceEl = $('resultsWorkspace'); noDataYetEl = $('noDataYet');
  lookupBarEl = document.querySelector('.lookup-bar'); searchInputEl = $('searchInput'); lookupMetaEl = $('lookupMeta');
  statCardsEl = $('statCards'); routeTabsEl = $('routeTabs'); filterChipsEl = $('filterChips');
  inputNgayDo = $('inputNgayDo'); inputNguoiDo = $('inputNguoiDo'); copyBarEl = $('copyBar');

  inputNgayDo.value = todayInputValue();
  setupListeners();

  btnGoogleLogin.addEventListener('click', function() {
    if (!initTokenClient()) { log('⚠️ Chưa load được Google Sign-In, bấm lại sau vài giây (hoặc F5)', 'err'); return; }
    try { tokenClient.requestAccessToken(); } catch (e) { log('❌ Lỗi khi mở popup: ' + e.message, 'err'); }
  });

  if (!initTokenClient()) {
    // script Google có thể load chậm: thử lại vài lần, nút đăng nhập vẫn bấm được
    let n = 0;
    const iv = setInterval(function() { if (initTokenClient() || ++n > 10) clearInterval(iv); }, 1000);
  }
  log('🚀 Web đã sẵn sàng. Bấm "Đăng nhập bằng Google" để bắt đầu.');
};

function setupListeners() {
  dropzone.addEventListener('click', function() { fileInput.click(); });
  dropzone.addEventListener('dragover', function(e) { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', function() { dropzone.classList.remove('dragover'); });
  dropzone.addEventListener('drop', function(e) { e.preventDefault(); dropzone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
  fileInput.addEventListener('change', function(e) { handleFiles(e.target.files); fileInput.value = ''; });

  document.getElementById('btnClearFiles').addEventListener('click', function() {
    if (!state.files.length) return;
    if (!confirm('Xóa danh sách file? File trên Drive sẽ tự xóa sau 5 giờ.')) return;
    state.files = [];
    renderFileList();
    log('🗑️ Đã xóa danh sách file khỏi giao diện');
  });

  document.querySelectorAll('.task-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { runTask(btn.dataset.action); });
  });
  document.getElementById('btnExportCSV').addEventListener('click', function() {
    if (state.lastResult) exportCSV(state.lastResult, state.lastType);
  });
  document.getElementById('btnCloseResult').addEventListener('click', showEmptyLookupState);

  let _t;
  searchInputEl.addEventListener('input', function() {
    clearTimeout(_t);
    _t = setTimeout(function() { state.view.searchText = searchInputEl.value; renderActiveView(); }, 150);
  });

  btnLogout.addEventListener('click', function() {
    if (state.accessToken && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.revoke(state.accessToken, function() {});
    }
    state.accessToken = null; state.tokenExp = 0; state.user = null; state.files = [];
    state.lastResult = null; state.lastType = null;
    userInfo.style.display = 'none';
    btnGoogleLogin.style.display = 'inline-flex';
    mainContent.style.display = 'none';
    loginNotice.style.display = 'flex';
    resultsWorkspaceEl.style.display = 'none';
    fileList.innerHTML = '';
    log('👋 Đã đăng xuất');
  });
}

async function fetchUserInfo() {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { 'Authorization': 'Bearer ' + state.accessToken } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const info = await res.json();
    state.user = info;
    loginNotice.style.display = 'none';
    mainContent.style.display = 'flex';
    btnGoogleLogin.style.display = 'none';
    userAvatar.src = info.picture || '';
    userName.textContent = info.name || info.email || '';
    userInfo.style.display = 'flex';
    resultsWorkspaceEl.style.display = 'block';
    showEmptyLookupState();
    log('✅ Đăng nhập thành công: ' + (info.name || info.email), 'ok');
  } catch (err) {
    log('❌ Lỗi lấy thông tin user: ' + err.message, 'err');
  }
}

function showEmptyLookupState() {
  noDataYetEl.style.display = 'flex';
  [lookupBarEl, statCardsEl, routeTabsEl, filterChipsEl, resultCard, copyBarEl].forEach(function(e) { e.style.display = 'none'; });
}
function updateLookupMeta() {
  lookupMetaEl.textContent = 'Hiển thị ' + state.view.shownCount + ' / ' + state.view.totalCount + ' dòng';
}

// ============ JSONP ============
let _jsonpCounter = 0;
function jsonpRequest(params, timeoutMs) {
  return new Promise(function(resolve, reject) {
    timeoutMs = timeoutMs || 180000;
    const cbName = '__jsonp_cb_' + (++_jsonpCounter) + '_' + Date.now();
    const url = API_URL + '?callback=' + cbName + '&' + params.toString();
    let done = false, timer;
    const script = document.createElement('script');
    const cleanup = function() {
      if (done) return;
      done = true;
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
      clearTimeout(timer);
    };
    window[cbName] = function(data) { cleanup(); resolve(data); };
    script.onerror = function() { cleanup(); reject(new Error('Không kết nối được API')); };
    timer = setTimeout(function() { cleanup(); reject(new Error('Hết thời gian chờ (' + Math.round(timeoutMs / 1000) + 's)')); }, timeoutMs);
    script.src = url;
    document.body.appendChild(script);
  });
}

// ============ UPLOAD DRIVE ============
function handleFiles(filesInput) {
  if (!ensureToken()) return;
  const files = Array.from(filesInput).filter(function(f) { return /\.xlsx?$/i.test(f.name); });
  if (!files.length) { log('⚠️ Chỉ nhận file .xlsx hoặc .xls', 'err'); return; }
  files.forEach(uploadFileToDrive);
}

async function uploadFileToDrive(file) {
  log('📤 Đang upload: ' + file.name + ' (' + formatSize(file.size) + ')');
  const rec = { fileName: file.name, size: file.size, status: 'uploading', fileId: null, uploadedAt: 0 }; // object ref, không dùng index
  state.files.push(rec);
  renderFileList();
  try {
    const boundary = '-------314159265358979323846';
    const metadata = { name: file.name, parents: [DRIVE_FOLDER_ID] };
    const body =
      '\r\n--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) +
      '\r\n--' + boundary + '\r\nContent-Type: ' + (file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') +
      '\r\nContent-Transfer-Encoding: base64\r\n\r\n' + await fileToBase64Raw(file) +
      '\r\n--' + boundary + '--';
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + state.accessToken, 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
      body: body
    });
    if (res.status === 401) { state.tokenExp = 0; throw new Error('Phiên đăng nhập hết hạn, đăng nhập lại rồi upload lại'); }
    if (!res.ok) throw new Error('Drive API ' + res.status + ' - ' + (await res.text()).substring(0, 200));
    const data = await res.json();
    rec.fileId = data.id; rec.uploadedAt = Date.now(); rec.status = 'done';
    log('✅ Upload xong: ' + file.name, 'ok');
  } catch (err) {
    rec.status = 'error';
    log('❌ Lỗi upload ' + file.name + ': ' + err.message, 'err');
  }
  renderFileList();
}

function fileToBase64Raw(file) {
  return new Promise(function(resolve, reject) {
    const r = new FileReader();
    r.onload = function() { resolve(String(r.result).split(',')[1]); };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function renderFileList() {
  fileList.innerHTML = state.files.map(function(f) {
    const label = { uploading: '⏳ Đang upload', done: '✅ Sẵn sàng', error: '❌ Lỗi', expired: '⌛ Hết hạn' }[f.status] || '';
    return '<div class="file-item ' + (f.status === 'expired' ? 'error' : f.status) + '"><span class="fi-icon">📄</span>' +
      '<span class="fi-name">' + esc(f.fileName) + '</span><span class="fi-size">' + formatSize(f.size) + '</span>' +
      '<span class="fi-status">' + label + '</span></div>';
  }).join('');
}

function getReadyFiles() {
  const now = Date.now();
  let expired = false;
  state.files.forEach(function(f) {
    if (f.status === 'done' && now - f.uploadedAt > FILE_TTL_MS) { f.status = 'expired'; expired = true; }
  });
  if (expired) { renderFileList(); log('⌛ Có file quá 5 giờ đã bị xóa khỏi Drive, cần upload lại', 'err'); }
  return state.files.filter(function(f) { return f.status === 'done'; });
}

// ============ TÁC VỤ ============
async function runTask(action) {
  if (!ensureToken()) return;
  const readyFiles = getReadyFiles();
  if (!readyFiles.length) { alert('⚠️ Chưa có file hợp lệ (chưa upload, lỗi, hoặc đã hết hạn 5 giờ).'); return; }
  if (action === 'soSanhEBMS') { await runSoSanhTungTuyen(readyFiles); return; }

  const taskName = { trichXuatV1: 'Trích xuất nhân viên v1', trichXuatV2: 'Trích xuất nhân viên v2', tongHopXe: 'Tổng hợp Xe / Lịch chạy' }[action];
  showLoading('Đang chạy: ' + taskName + '...');
  log('▶️ Bắt đầu: ' + taskName + ' (' + readyFiles.length + ' file)');
  try {
    const params = new URLSearchParams();
    params.append('action', action);
    params.append('fileIds', JSON.stringify(readyFiles.map(function(f) { return f.fileId; })));
    params.append('ngayDo', inputNgayDo.value ? formatDateVN(inputNgayDo.value) : todayVN());
    if (action === 'trichXuatV1') params.append('nguoiDo', (inputNguoiDo.value || '').trim() || 'Nguyễn Hoài Nam');

    const data = await jsonpRequest(params, 180000);
    if (!data || !data.ok) throw new Error((data && data.error) || 'Lỗi không xác định');
    log('✅ ' + taskName + ' xong!', 'ok');
    state.lastResult = data; state.lastType = action;
    renderResult(data, action);
  } catch (err) {
    log('❌ Lỗi ' + taskName + ': ' + err.message, 'err');
    alert('Lỗi: ' + err.message + '\n(Nếu báo không tìm thấy file: file có thể đã hết hạn, upload lại)');
  } finally {
    hideLoading();
  }
}

async function runSoSanhTungTuyen(readyFiles) {
  showLoading('Đang chạy so sánh EBMS...');
  log('▶️ Bắt đầu: So sánh EBMS (' + readyFiles.length + ' file)');
  try {
    const routeFiles = [];
    readyFiles.forEach(function(f) {
      const name = String(f.fileName).normalize('NFC');
      const m = name.match(/Tuy[eếêề]n\s*0*(\d{1,3})/i) || name.match(/Tuy[eếêề]n\D*?(\d{1,3})/i);
      if (m) routeFiles.push({ fileId: f.fileId, fileName: f.fileName, routeNumber: parseInt(m[1], 10) });
      else log('⚠️ Bỏ qua: ' + f.fileName + ' (không nhận diện được tuyến)', 'err');
    });
    if (!routeFiles.length) { alert('⚠️ Không có file nào có "Tuyến <số>" trong tên'); return; }

    const allRoutes = {};
    const summaries = new Array(routeFiles.length);
    let next = 0, finished = 0;

    async function worker() {
      while (next < routeFiles.length) {
        const i = next++;
        const rf = routeFiles[i];
        log('⏳ Tuyến ' + rf.routeNumber + '...');
        try {
          const params = new URLSearchParams();
          params.append('action', 'soSanh1Tuyen');
          params.append('fileId', rf.fileId);
          params.append('routeNumber', String(rf.routeNumber));
          const data = await jsonpRequest(params, 60000);
          if (!data || !data.ok) throw new Error((data && data.error) || 'Lỗi không xác định');
          allRoutes[rf.routeNumber] = { results: data.results || [], ngayPhancong: data.ngayPhancong };
          summaries[i] = '✅ Tuyến ' + rf.routeNumber + ' (ngày ' + data.ngayPhancong + '): ' + data.total + ' chuyến';
          log('✅ Tuyến ' + rf.routeNumber + ' xong (' + data.total + ' chuyến)', 'ok');
        } catch (err) {
          summaries[i] = '❌ Tuyến ' + rf.routeNumber + ': ' + err.message;
          log('❌ Tuyến ' + rf.routeNumber + ': ' + err.message, 'err');
        }
        finished++;
        showLoading('So sánh EBMS: xong ' + finished + '/' + routeFiles.length + ' tuyến...');
      }
    }
    const workers = [];
    for (let w = 0; w < Math.min(PARALLEL_ROUTES, routeFiles.length); w++) workers.push(worker());
    await Promise.all(workers);

    log('✅ Hoàn tất so sánh EBMS', 'ok');
    state.lastResult = { ok: true, type: 'soSanhEBMS', summary: summaries.filter(Boolean), routes: allRoutes };
    state.lastType = 'soSanhEBMS';
    renderResult(state.lastResult, 'soSanhEBMS');
  } catch (err) {
    log('❌ Lỗi so sánh EBMS: ' + err.message, 'err');
    alert('Lỗi: ' + err.message);
  } finally {
    hideLoading();
  }
}

// ============ PHÂN LOẠI ============
function categoryOf(loai) {
  loai = String(loai || '');
  if (loai.includes('KHỚP')) return 'KHỚP';
  if (loai.includes('LỆCH GIỜ KẾ HOẠCH')) return 'LỆCH GIỜ KẾ HOẠCH';
  if (loai.includes('LỆCH')) return 'LỆCH';
  if (loai.includes('KHÔNG CÓ PHÂN CÔNG')) return 'KHÔNG CÓ PHÂN CÔNG';
  if (loai.includes('THIẾU EBMS')) return 'THIẾU EBMS';
  return 'KHÁC';
}
function rowClassSoSanh(loai) {
  return { 'KHỚP': 'row-ok', 'LỆCH': 'row-warn', 'LỆCH GIỜ KẾ HOẠCH': 'row-plan', 'KHÔNG CÓ PHÂN CÔNG': 'row-miss-pc', 'THIẾU EBMS': 'row-miss-ebms' }[categoryOf(loai)] || '';
}
function canhBaoSeverity_(s) {
  if (!s) return '';
  if (s.indexOf(':do') !== -1) return 'do';
  if (s.indexOf(':vang') !== -1) return 'vang';
  if (s.indexOf(':xanh') !== -1) return 'xanh';
  return '';
}
function rowClassTongHopXe(rec) {
  if (rec.canhBaoTrungGio) return 'row-miss-pc';
  const sev = canhBaoSeverity_(rec.canhBao);
  return sev === 'do' ? 'row-miss-pc' : sev === 'vang' ? 'row-warn' : sev === 'xanh' ? 'row-ok' : 'row-ok';
}
function cellFlagClass(s, key) {
  if (!s) return '';
  const m = String(s).match(new RegExp(key + ':(do|vang|xanh)'));
  return m ? 'flag-' + m[1] : '';
}
function flagInfo(rec) {
  const cb = rec.canhBao || '';
  const xe = /gioDieuXe:(do|vang)/.test(cb), ben = /gioVeBen:(do|vang)/.test(cb), trung = !!rec.canhBaoTrungGio;
  return { xe: xe, ben: ben, trung: trung, any: xe || ben || trung };
}

// ============ RENDER CHUNG ============
function renderResult(data, action) {
  noDataYetEl.style.display = 'none';
  lookupBarEl.style.display = 'flex';
  statCardsEl.style.display = 'flex';
  routeTabsEl.style.display = 'flex';
  resultCard.style.display = 'block';
  state.view = { activeRoute: 'all', activeFilter: 'all', searchText: '', shownCount: 0, totalCount: 0 };
  searchInputEl.value = '';
  copyBarEl.style.display = 'none';
  copyBarEl.innerHTML = '';
  const routes = data.routes || {};

  if (action === 'soSanhEBMS') {
    resultTitle.textContent = '📊 Kết quả so sánh EBMS';
    buildStatCardsSoSanh(routes); buildRouteTabs(routes); buildFilterChipsSoSanh(routes);
  } else if (action === 'tongHopXe') {
    resultTitle.textContent = '🚐 Kết quả Tổng hợp Xe / Lịch chạy';
    buildStatCardsTongHopXe(routes, data.tongMatChuyen); buildRouteTabs(routes); buildFilterChipsTongHopXe(routes);
  } else {
    resultTitle.textContent = action === 'trichXuatV1' ? '👥 Kết quả trích xuất NV v1' : '📋 Kết quả trích xuất NV v2';
    buildStatCardsTrichXuat(routes, action); buildRouteTabs(routes);
    if (action === 'trichXuatV1') buildCopyBarV1(routes);
    filterChipsEl.style.display = 'none'; filterChipsEl.innerHTML = '';
  }
  summaryEl.textContent = Array.isArray(data.summary) ? data.summary.join('\n') : (data.summary || '');
  renderActiveView();
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildRouteTabs(routes) {
  routeTabsEl.innerHTML = '<button class="route-tab active" data-route="all">Tất cả tuyến</button>' +
    sortedKeys(routes).map(function(r) { return '<button class="route-tab" data-route="' + esc(r) + '">Tuyến ' + esc(r) + '</button>'; }).join('');
  routeTabsEl.querySelectorAll('.route-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      routeTabsEl.querySelectorAll('.route-tab').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      state.view.activeRoute = btn.dataset.route;
      renderActiveView();
    });
  });
}

function buildChips(categories, counts, total) {
  filterChipsEl.style.display = 'flex';
  filterChipsEl.innerHTML = categories.map(function(c) {
    const n = c.key === 'all' ? total : (counts[c.key] || 0);
    if (c.key !== 'all' && n === 0) return '';
    return '<button class="filter-chip' + (c.key === 'all' ? ' active' : '') + '" data-filter="' + esc(c.key) + '">' +
      esc(c.label) + ' <span class="chip-count">' + n + '</span></button>';
  }).join('');
  filterChipsEl.querySelectorAll('.filter-chip').forEach(function(btn) {
    btn.addEventListener('click', function() {
      filterChipsEl.querySelectorAll('.filter-chip').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      state.view.activeFilter = btn.dataset.filter;
      renderActiveView();
    });
  });
}

function buildFilterChipsSoSanh(routes) {
  const counts = {}; let total = 0;
  Object.keys(routes).forEach(function(r) {
    routes[r].results.forEach(function(row) { const c = categoryOf(row.loai); counts[c] = (counts[c] || 0) + 1; total++; });
  });
  buildChips([
    { key: 'all', label: 'Tất cả' }, { key: 'KHỚP', label: 'Khớp' }, { key: 'LỆCH GIỜ KẾ HOẠCH', label: 'Lệch giờ KH' },
    { key: 'LỆCH', label: 'Lệch' }, { key: 'KHÔNG CÓ PHÂN CÔNG', label: 'Thiếu PC' }, { key: 'THIẾU EBMS', label: 'Thiếu EBMS' }
  ], counts, total);
}

function buildFilterChipsTongHopXe(routes) {
  const counts = { canhBao: 0, gioDieuXe: 0, gioVeBen: 0, trungGio: 0 }; let total = 0;
  Object.keys(routes).forEach(function(r) {
    (routes[r].records || []).forEach(function(rec) {
      total++;
      const f = flagInfo(rec);
      if (f.xe) counts.gioDieuXe++;
      if (f.ben) counts.gioVeBen++;
      if (f.trung) counts.trungGio++;
      if (f.any) counts.canhBao++;
    });
  });
  buildChips([
    { key: 'all', label: 'Tất cả' }, { key: 'canhBao', label: 'Có cảnh báo' }, { key: 'gioDieuXe', label: 'Giờ điều xe' },
    { key: 'gioVeBen', label: 'Giờ về bến' }, { key: 'trungGio', label: 'Trùng giờ xe' }
  ], counts, total);
}

function setStatCards(cards) {
  statCardsEl.style.display = 'flex';
  statCardsEl.innerHTML = cards.map(function(c) {
    return '<div class="stat-card tone-' + c.tone + '"><div class="stat-value">' + c.value + '</div><div class="stat-label">' + esc(c.label) + '</div></div>';
  }).join('');
}

function buildStatCardsSoSanh(routes) {
  const counts = {}; let total = 0;
  Object.keys(routes).forEach(function(r) {
    routes[r].results.forEach(function(row) { const c = categoryOf(row.loai); counts[c] = (counts[c] || 0) + 1; total++; });
  });
  setStatCards([
    { label: 'Tổng số chuyến', value: total, tone: 'neutral' },
    { label: 'Khớp', value: counts['KHỚP'] || 0, tone: 'ok' },
    { label: 'Lệch giờ', value: (counts['LỆCH'] || 0) + (counts['LỆCH GIỜ KẾ HOẠCH'] || 0), tone: 'warn' },
    { label: 'Thiếu phân công', value: counts['KHÔNG CÓ PHÂN CÔNG'] || 0, tone: 'danger' },
    { label: 'Thiếu EBMS', value: counts['THIẾU EBMS'] || 0, tone: 'danger2' }
  ]);
}

function buildStatCardsTrichXuat(routes, action) {
  let totalNV = 0, totalViPham = 0;
  Object.keys(routes).forEach(function(r) {
    routes[r].forEach(function(row) { totalNV++; if (action === 'trichXuatV1' && row.viPham) totalViPham++; });
  });
  const cards = [
    { label: 'Tổng lượt nhân viên', value: totalNV, tone: 'neutral' },
    { label: 'Số tuyến', value: Object.keys(routes).length, tone: 'neutral' }
  ];
  if (action === 'trichXuatV1') cards.push({ label: 'Vi phạm', value: totalViPham, tone: 'danger' });
  setStatCards(cards);
}

function buildStatCardsTongHopXe(routes, tongMatChuyen) {
  let tc = 0, dx = 0, vb = 0, tg = 0;
  Object.keys(routes).forEach(function(r) {
    (routes[r].records || []).forEach(function(rec) {
      tc++;
      const f = flagInfo(rec);
      if (f.xe) dx++; if (f.ben) vb++; if (f.trung) tg++;
    });
  });
  setStatCards([
    { label: 'Tổng số chuyến', value: tc, tone: 'neutral' },
    { label: 'Số tuyến', value: Object.keys(routes).length, tone: 'neutral' },
    { label: 'Cảnh báo giờ điều xe', value: dx, tone: 'warn' },
    { label: 'Cảnh báo giờ về bến', value: vb, tone: 'warn' },
    { label: 'Trùng giờ xe', value: tg, tone: 'danger' },
    { label: 'Mất chuyến', value: tongMatChuyen || 0, tone: 'danger2' }
  ]);
}

// ============ RENDER BẢNG ============
function renderActiveView() {
  if (!state.lastResult) return;
  const action = state.lastType;
  const routes = state.lastResult.routes || {};
  const keys = state.view.activeRoute === 'all' ? sortedKeys(routes) : [state.view.activeRoute];
  if (action === 'soSanhEBMS') renderSoSanhFiltered(routes, keys);
  else if (action === 'tongHopXe') renderTongHopXeFiltered(routes, keys);
  else renderTrichXuatFiltered(routes, keys, action);
  updateLookupMeta();
}

function tableHtml(heads, rowsHtml) {
  return '<table><thead><tr>' + heads.map(function(c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + rowsHtml + '</tbody></table>';
}
function finishRender(htmlParts, shown, total, emptyMsg) {
  resultContent.innerHTML = htmlParts.length ? htmlParts.join('') : '<p class="empty-hint">' + emptyMsg + '</p>';
  state.view.shownCount = shown;
  state.view.totalCount = total;
}

function renderSoSanhFiltered(routes, keys) {
  const q = normalizeSearch(state.view.searchText), af = state.view.activeFilter;
  const parts = []; let shown = 0, total = 0;
  keys.forEach(function(r) {
    const info = routes[r]; if (!info) return;
    let rows = '';
    info.results.forEach(function(row) {
      total++;
      if (af !== 'all' && categoryOf(row.loai) !== af) return;
      if (q && normalizeSearch([row.loai, row.khDi, row.khDen, row.khXe, row.thXe, row.thDi, row.thDen, row.benDau, row.trangThaiEBMS,
        row.lichChayPC, row.xePC, row.benXuatPhatPC, row.gioDiPC, row.gioDenPC, row.ghi, r].join(' ')).indexOf(q) === -1) return;
      shown++;
      rows += '<tr class="' + rowClassSoSanh(row.loai) + '">' +
        [row.loai, row.khDi, row.khDen, row.khXe, row.thXe, row.thDi, row.thDen, row.benDau, row.trangThaiEBMS,
         row.lichChayPC, row.xePC, row.benXuatPhatPC, row.gioDiPC, row.gioDenPC, row.chenhLechDi, row.chenhLechDen, row.soBen].map(function(v) { return td(v); }).join('') +
        td(row.ghi, 'notes') + '</tr>';
    });
    if (!rows) return;
    parts.push('<h3 class="route-heading">🚌 Tuyến ' + esc(r) + ' — Ngày ' + esc(info.ngayPhancong) + '</h3>' +
      tableHtml(['Loại','KH Đi','KH Đến','KH Xe','TH Xe','TH Đi','TH Đến','Bến đầu','TT EBMS','Lịch chạy PC','Xe PC','Bến PC','Giờ đi PC','Giờ đến PC','Lệch Đi','Lệch Về','So bến','Ghi chú'], rows));
  });
  finishRender(parts, shown, total, 'Không có dòng nào khớp với bộ lọc hiện tại.');
}

function renderTrichXuatFiltered(routes, keys, action) {
  const q = normalizeSearch(state.view.searchText), v1 = action === 'trichXuatV1';
  const parts = []; let shown = 0, total = 0;
  keys.forEach(function(r) {
    const list = routes[r] || []; let rows = '';
    list.forEach(function(row) {
      total++;
      if (q && normalizeSearch([row.ten, row.chucVu, row.ngay, r, v1 ? row.nguoiDo : ''].join(' ')).indexOf(q) === -1) return;
      shown++;
      rows += '<tr class="' + (row.isAmbiguous ? 'row-ambiguous' : '') + '">';
      if (v1) {
        rows += td(row.ngay) + td(row.tuyen) + td(row.gioDi) + td(row.gioXuatBen) + td(row.thoiGianDo) +
          '<td style="text-align:left">' + esc(row.ten) + '</td>' + td(row.chucVu) +
          '<td>' + (row.trangThai ? '✅' : '⬜') + '</td><td>' + (row.viPham ? '⚠️' : '⬜') + '</td>' + td(row.nguoiDo);
      } else {
        rows += td(row.ngay) + td(row.tuyen) + '<td style="text-align:left">' + esc(row.ten) + '</td>' + td(row.chucVu);
      }
      rows += '</tr>';
    });
    if (!rows) return;
    const heads = v1 ? ['Ngày','Tuyến','Giờ đi','Giờ xuất bến','Thời gian đo','Tên','Chức vụ','Trạng thái','Vi phạm','Người đo'] : ['Ngày','Tuyến','Tên','Chức vụ'];
    parts.push('<h3 class="route-heading">🚌 Tuyến ' + esc(r) + ' — ' + list.length + ' nhân viên</h3>' + tableHtml(heads, rows));
  });
  finishRender(parts, shown, total, 'Không có dòng nào khớp với tìm kiếm.');
}

function renderTongHopXeFiltered(routes, keys) {
  const q = normalizeSearch(state.view.searchText), af = state.view.activeFilter;
  const parts = []; let shown = 0, total = 0;
  keys.forEach(function(r) {
    const info = routes[r]; if (!info) return;
    const records = info.records || [], missed = info.missed || [];
    let rows = '', missedRows = '';

    records.forEach(function(rec) {
      total++;
      const f = flagInfo(rec);
      if (af === 'canhBao' && !f.any) return;
      if (af === 'gioDieuXe' && !f.xe) return;
      if (af === 'gioVeBen' && !f.ben) return;
      if (af === 'trungGio' && !f.trung) return;
      if (q && normalizeSearch([rec.xe, rec.lichChay, rec.canhBaoTrungGio, r].join(' ')).indexOf(q) === -1) return;
      shown++;
      const chenh = rec.chenhLechGioDi == null ? 'N/A' : (rec.chenhLechGioDi > 0 ? '+' : '') + rec.chenhLechGioDi + ' phút';
      rows += '<tr class="' + rowClassTongHopXe(rec) + '">' + td(rec.xe) + td(rec.lichChay) +
        td(rec.gioDieuXe || '-', cellFlagClass(rec.canhBao, 'gioDieuXe')) + td(rec.gioDi || '-', cellFlagClass(rec.canhBao, 'gioDi')) +
        td(rec.gioDen || '-') + td(rec.gioVeBen || '-', cellFlagClass(rec.canhBao, 'gioVeBen')) + td(chenh) + td(rec.canhBaoTrungGio, 'notes') + '</tr>';
    });

    missed.forEach(function(m) {
      total++;
      if (af !== 'all') return; // chip lọc cảnh báo không áp dụng cho chuyến mất
      if (q && normalizeSearch([m.xe, m.taiXe, m.tiepVien, m.maChuyen, m.trangThai, r].join(' ')).indexOf(q) === -1) return;
      shown++;
      missedRows += '<tr class="' + (m.daXacNhan ? 'row-miss-pc' : 'row-warn') + '">' + td(m.maChuyen) + td(m.lichChay) + td(m.benXuatPhat) + td(m.xe) + td(m.loaiChuyen) +
        '<td style="text-align:left">' + esc(m.taiXe) + '</td><td style="text-align:left">' + esc(m.tiepVien) + '</td>' + td(m.trangThai) +
        '<td>' + (m.daXacNhan ? '✅ Đã xác nhận' : '🟡 Đề xuất') + '</td></tr>';
    });

    if (rows) parts.push('<h3 class="route-heading">🚌 Tuyến ' + esc(r) + ' — ' + records.length + ' chuyến</h3>' +
      tableHtml(['Xe','Lịch chạy','Giờ điều xe','Giờ đi','Giờ đến','Giờ về bến','Chênh lệch giờ đi','Ghi chú'], rows));
    if (missedRows) parts.push('<h3 class="route-heading route-heading-danger">⚠️ Tuyến ' + esc(r) + ' — Chuyến mất / đề xuất mất (' + missed.length + ')</h3>' +
      tableHtml(['Mã chuyến','Lịch chạy','Bến xuất phát','Xe','Loại chuyến','Tài xế','Tiếp viên','Trạng thái','Xác nhận'], missedRows));
  });
  finishRender(parts, shown, total, 'Không có dòng nào khớp với bộ lọc hiện tại.');
}

// ============ COPY NV v1 ============
function buildCopyBarV1(routes) {
  copyBarEl.innerHTML = sortedKeys(routes).map(function(r) {
    return '<button class="btn btn-ghost btn-copy" data-route="' + esc(r) + '">📋 Copy tuyến ' + esc(r) + ' (' + routes[r].length + ')</button>';
  }).join('');
  copyBarEl.style.display = 'flex';
  copyBarEl.querySelectorAll('.btn-copy').forEach(function(btn) {
    btn.addEventListener('click', function() { copyRouteV1(btn.dataset.route, btn); });
  });
}

function copyRouteV1(r, btn) {
  const list = (state.lastResult && state.lastResult.routes[r]) || [];
  const clean = function(v) { return String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' '); };
  const text = list.map(function(row) {
    return [row.ngay, row.tuyen, row.gioDi, row.gioXuatBen, row.thoiGianDo, row.ten, row.chucVu,
      row.trangThai ? 'TRUE' : 'FALSE', row.viPham ? 'TRUE' : 'FALSE', row.nguoiDo].map(clean).join('\t');
  }).join('\n');
  copyToClipboard(text).then(function() {
    const old = btn.textContent;
    btn.textContent = '✅ Đã copy tuyến ' + r;
    btn.classList.add('btn-copied');
    log('📋 Đã copy tuyến ' + r + ' (' + list.length + ' dòng)', 'ok');
    setTimeout(function() { btn.textContent = old; btn.classList.remove('btn-copied'); }, 1500);
  }).catch(function(err) { log('❌ Không copy được: ' + err.message, 'err'); });
}

function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  return new Promise(function(resolve, reject) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy') ? resolve() : reject(new Error('execCommand thất bại')); } catch (e) { reject(e); }
    document.body.removeChild(ta);
  });
}

// ============ EXPORT CSV ============
function csvCell(v) {
  let s = String(v == null ? '' : v);
  // chống CSV injection, nhưng không đụng số âm như -5
  if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && isNaN(Number(s)))) s = "'" + s;
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportCSV(data, action) {
  const rows = [], routes = data.routes || {};
  if (action === 'soSanhEBMS') {
    rows.push(['Tuyến','Ngày','Loại','KH Đi','KH Đến','KH Xe','TH Xe','TH Đi','TH Đến','Bến đầu','TT EBMS','Lịch chạy PC','Xe PC','Bến PC','Giờ đi PC','Giờ đến PC','Lệch Đi','Lệch Về','So bến','Ghi chú']);
    Object.keys(routes).forEach(function(r) {
      routes[r].results.forEach(function(row) {
        rows.push([r, routes[r].ngayPhancong, row.loai, row.khDi, row.khDen, row.khXe, row.thXe, row.thDi, row.thDen, row.benDau, row.trangThaiEBMS,
          row.lichChayPC, row.xePC, row.benXuatPhatPC, row.gioDiPC, row.gioDenPC, row.chenhLechDi, row.chenhLechDen, row.soBen, row.ghi]);
      });
    });
  } else if (action === 'trichXuatV1') {
    rows.push(['Ngày','Tuyến','Giờ đi','Giờ xuất bến','Thời gian đo','Tên','Chức vụ','Trạng thái','Vi phạm','Người đo']);
    Object.keys(routes).forEach(function(r) {
      routes[r].forEach(function(row) {
        rows.push([row.ngay, row.tuyen, row.gioDi, row.gioXuatBen, row.thoiGianDo, row.ten, row.chucVu, row.trangThai ? 'TRUE' : 'FALSE', row.viPham ? 'TRUE' : 'FALSE', row.nguoiDo]);
      });
    });
  } else if (action === 'tongHopXe') {
    rows.push(['Tuyến','Xe','Lịch chạy','Giờ điều xe','Giờ đi','Giờ đến','Giờ về bến','Chênh lệch giờ đi','Cảnh báo','Cảnh báo trùng giờ']);
    Object.keys(routes).forEach(function(r) {
      (routes[r].records || []).forEach(function(rec) {
        rows.push([r, rec.xe, rec.lichChay, rec.gioDieuXe, rec.gioDi, rec.gioDen, rec.gioVeBen, rec.chenhLechGioDi, rec.canhBao, rec.canhBaoTrungGio]);
      });
    });
    rows.push([]);
    rows.push(['--- CHUYẾN MẤT / ĐỀ XUẤT MẤT ---']);
    rows.push(['Tuyến','Mã chuyến','Ngày PC','Lịch chạy','Bến xuất phát','Xe','Loại chuyến','Tài xế','Tiếp viên','Giờ điều xe','Giờ đi','Lộ trình','Trạng thái','Đã xác nhận']);
    Object.keys(routes).forEach(function(r) {
      (routes[r].missed || []).forEach(function(m) {
        // backend có thể đặt tên field khác nhau (ngayPhanCong/ngayPhancong, loTrinh): lấy cái nào có
        rows.push([r, m.maChuyen, m.ngayPhanCong || m.ngayPhancong, m.lichChay, m.benXuatPhat, m.xe, m.loaiChuyen, m.taiXe, m.tiepVien,
          m.gioDieuXe, m.gioDi, m.loTrinh || m.loTrinhChay, m.trangThai, m.daXacNhan ? 'TRUE' : 'FALSE']);
      });
    });
  } else {
    rows.push(['Ngày','Tuyến','Tên','Chức vụ']);
    Object.keys(routes).forEach(function(r) {
      routes[r].forEach(function(row) { rows.push([row.ngay, row.tuyen, row.ten, row.chucVu]); });
    });
  }
  const csv = rows.map(function(row) { return row.map(csvCell).join(','); }).join('\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = action + '_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  log('⬇️ Đã xuất CSV', 'ok');
}

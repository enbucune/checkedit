// ============ CẤU HÌNH ============
const API_URL = 'https://script.google.com/macros/s/AKfycbyNsgSGcAqHXozITTRJKttOSWhG2yYSmYt9KXrQI0bw2CTBS0yCQApPQ_quviC50N2M/exec';
const DRIVE_FOLDER_ID = '10wMnomA-GMKu7VTFRSMyvvh7Zz-dTAfx';
const CLIENT_ID = '98709712620-nnajeb7oh59euiasptv0ljpi6r80v4ph.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

// ============ STATE ============
const state = {
  accessToken: null,
  user: null,
  files: [],
  lastResult: null,
  lastType: null,
  view: {
    activeRoute: 'all',
    activeFilter: 'all',
    searchText: '',
    shownCount: 0,
    totalCount: 0
  }
};

// ============ DOM (gán trong window.onload) ============
let dropzone, fileInput, fileList, logEl, loading, loadingText;
let resultCard, resultTitle, resultContent, summaryEl;
let loginNotice, mainContent, userInfo, userAvatar, userName;
let btnLogout, btnGoogleLogin;
let resultsWorkspaceEl, noDataYetEl, lookupBarEl, searchInputEl, lookupMetaEl;
let statCardsEl, routeTabsEl, filterChipsEl;
let inputNgayDo, inputNguoiDo;

// ============ LOG ============
function log(msg, type) {
  type = type || 'info';
  if (!logEl) { console.log(msg); return; }
  const time = new Date().toLocaleTimeString('vi-VN');
  const cls = type === 'ok' ? 'log-ok' : type === 'err' ? 'log-err' : 'log-info';
  const line = document.createElement('div');
  line.innerHTML = '<span class="log-time">' + time + '</span><span class="' + cls + '">' + msg + '</span>';
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

// ============ LOADING ============
function showLoading(text) {
  if (!loading) return;
  loadingText.textContent = text || 'Đang xử lý...';
  loading.style.display = 'flex';
}
function hideLoading() {
  if (!loading) return;
  loading.style.display = 'none';
}

// ============ GOOGLE SIGN-IN ============
let tokenClient = null;

window.onload = function() {
  dropzone = document.getElementById('dropzone');
  fileInput = document.getElementById('fileInput');
  fileList = document.getElementById('fileList');
  logEl = document.getElementById('log');
  loading = document.getElementById('loading');
  loadingText = document.getElementById('loadingText');
  resultCard = document.getElementById('resultCard');
  resultTitle = document.getElementById('resultTitle');
  resultContent = document.getElementById('resultContent');
  summaryEl = document.getElementById('summary');
  loginNotice = document.getElementById('loginNotice');
  mainContent = document.getElementById('mainContent');
  userInfo = document.getElementById('userInfo');
  userAvatar = document.getElementById('userAvatar');
  userName = document.getElementById('userName');
  btnLogout = document.getElementById('btnLogout');
  btnGoogleLogin = document.getElementById('btnGoogleLogin');

  resultsWorkspaceEl = document.getElementById('resultsWorkspace');
  noDataYetEl = document.getElementById('noDataYet');
  lookupBarEl = document.querySelector('.lookup-bar');
  searchInputEl = document.getElementById('searchInput');
  lookupMetaEl = document.getElementById('lookupMeta');
  statCardsEl = document.getElementById('statCards');
  routeTabsEl = document.getElementById('routeTabs');
  filterChipsEl = document.getElementById('filterChips');
  inputNgayDo = document.getElementById('inputNgayDo');
  inputNguoiDo = document.getElementById('inputNguoiDo');

  inputNgayDo.value = todayInputValue();

  setupOtherListeners();

  if (typeof google === 'undefined' || !google.accounts) {
    log('⚠️ Không load được Google Sign-In. Đợi vài giây rồi refresh trang.', 'err');
    return;
  }
    tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: function(resp) {
      log('🔍 DEBUG - Full response: ' + JSON.stringify(resp), 'info');
      if (resp.error) {
        log('❌ Lỗi đăng nhập: ' + resp.error + ' | ' + (resp.error_description || ''), 'err');
        return;
      }
      if (!resp.access_token) {
        log('❌ Không nhận được access_token từ Google (rỗng/undefined)', 'err');
        return;
      }
      log('✅ Nhận token OK, độ dài: ' + resp.access_token.length, 'ok');
      state.accessToken = resp.access_token;
      fetchUserInfo();
    }
  });

  btnGoogleLogin.addEventListener('click', function() {
    if (!tokenClient) {
      log('⚠️ Chưa load được Google Sign-In, đợi vài giây rồi thử lại', 'err');
      return;
    }
    log('🔍 DEBUG - Bấm nút đăng nhập, đang mở popup Google...', 'info');
    try {
      tokenClient.requestAccessToken();
    } catch (e) {
      log('❌ Lỗi khi mở popup: ' + e.message, 'err');
    }
  });

  log('🚀 Web đã sẵn sàng. Bấm "Đăng nhập bằng Google" để bắt đầu.');
};

function setupOtherListeners() {
  dropzone.addEventListener('click', function() { fileInput.click(); });
  dropzone.addEventListener('dragover', function(e) {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', function() { dropzone.classList.remove('dragover'); });
  dropzone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', function(e) { handleFiles(e.target.files); });

  document.getElementById('btnClearFiles').addEventListener('click', function() {
    if (!state.files.length) return;
    if (!confirm('Xóa danh sách file đã upload? File trên Drive vẫn còn.')) return;
    state.files = [];
    renderFileList();
    log('🗑️ Đã xóa danh sách file khỏi giao diện');
  });

  document.querySelectorAll('.task-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { runTask(btn.dataset.action); });
  });

  document.getElementById('btnExportCSV').addEventListener('click', function() {
    if (!state.lastResult) return;
    exportCSV(state.lastResult, state.lastType);
  });

  document.getElementById('btnCloseResult').addEventListener('click', function() {
    showEmptyLookupState();
  });

  searchInputEl.addEventListener('input', function() {
    state.view.searchText = searchInputEl.value;
    renderActiveView();
  });

  btnLogout.addEventListener('click', function() {
    if (state.accessToken && google && google.accounts) {
      google.accounts.oauth2.revoke(state.accessToken, function() {});
    }
    state.accessToken = null;
    state.user = null;
    state.files = [];
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
    log('🔍 DEBUG - Gọi userinfo với token dài: ' + (state.accessToken ? state.accessToken.length : 'KHÔNG CÓ TOKEN'), 'info');
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': 'Bearer ' + state.accessToken }
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error('HTTP ' + res.status + ' - ' + errBody);
    }
    const info = await res.json();
    state.user = info;
    showLoggedIn(info);
    log('✅ Đăng nhập thành công: ' + (info.name || info.email), 'ok');
  } catch (err) {
    log('❌ Lỗi lấy thông tin user: ' + err.message, 'err');
  }
}

function showLoggedIn(info) {
  loginNotice.style.display = 'none';
  mainContent.style.display = 'flex';
  btnGoogleLogin.style.display = 'none';
  userAvatar.src = info.picture || '';
  userName.textContent = info.name || info.email || '';
  userInfo.style.display = 'flex';
  resultsWorkspaceEl.style.display = 'block';
  showEmptyLookupState();
}

// ============ TRẠNG THÁI KHU VỰC TRA CỨU ============
function showEmptyLookupState() {
  noDataYetEl.style.display = 'flex';
  lookupBarEl.style.display = 'none';
  statCardsEl.style.display = 'none';
  routeTabsEl.style.display = 'none';
  filterChipsEl.style.display = 'none';
  resultCard.style.display = 'none';
}

function updateLookupMeta() {
  lookupMetaEl.textContent = 'Hiển thị ' + state.view.shownCount + ' / ' + state.view.totalCount + ' dòng';
}

// ============ TÌM KIẾM KHÔNG DẤU ============
function normalizeSearch(str) {
  return String(str == null ? '' : str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

// ============ NGÀY GHI NHẬN ============
function pad2(n) { return String(n).padStart(2, '0'); }

// yyyy-mm-dd (giá trị input[type=date] mặc định là hôm nay)
function todayInputValue() {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

// yyyy-mm-dd -> dd/MM/yyyy (định dạng hiển thị/khớp dữ liệu, vd 25/09/2026)
function formatDateVN(yyyyMmDd) {
  const parts = String(yyyyMmDd).split('-');
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function todayVN() {
  const d = new Date();
  return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
}

// ============ JSONP ============
let _jsonpCounter = 0;
function jsonpRequest(params, timeoutMs) {
  return new Promise(function(resolve, reject) {
    timeoutMs = timeoutMs || 180000;
    const cbName = '__jsonp_cb_' + (++_jsonpCounter) + '_' + Date.now();
    const url = API_URL + '?callback=' + cbName + '&' + params.toString();
    let done = false;
    const script = document.createElement('script');
    const cleanup = function() {
      if (done) return;
      done = true;
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
      clearTimeout(timer);
    };
    window[cbName] = function(data) { cleanup(); resolve(data); };
    script.onerror = function() {
      cleanup();
      reject(new Error('Không kết nối được API'));
    };
    const timer = setTimeout(function() {
      cleanup();
      reject(new Error('Hết thời gian chờ (' + Math.round(timeoutMs/1000) + 's)'));
    }, timeoutMs);
    script.src = url;
    document.body.appendChild(script);
  });
}

// ============ UPLOAD LÊN DRIVE ============
function handleFiles(filesInput) {
  if (!state.accessToken) {
    log('⚠️ Chưa đăng nhập Google', 'err');
    return;
  }
  const files = Array.from(filesInput).filter(function(f) {
    return f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls');
  });
  if (!files.length) {
    log('⚠️ Chỉ nhận file .xlsx hoặc .xls', 'err');
    return;
  }
  files.forEach(uploadFileToDrive);
}

async function uploadFileToDrive(file) {
  log('📤 Đang upload: ' + file.name + ' (' + formatSize(file.size) + ')');
  const idx = state.files.length;
  state.files.push({ fileName: file.name, size: file.size, status: 'uploading' });
  renderFileList();

  try {
    const metadata = { name: file.name, parents: [DRIVE_FOLDER_ID] };
    const boundary = '-------314159265358979323846';
    const delimiter = '\r\n--' + boundary + '\r\n';
    const closeDelim = '\r\n--' + boundary + '--';
    const fileContent = await fileToBase64Raw(file);
    const multipartBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: ' + (file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') + '\r\n' +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      fileContent +
      closeDelim;

    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + state.accessToken,
          'Content-Type': 'multipart/related; boundary="' + boundary + '"'
        },
        body: multipartBody
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error('Drive API: ' + res.status + ' - ' + errText.substring(0, 200));
    }
    const data = await res.json();
    state.files[idx].fileId = data.id;
    state.files[idx].status = 'done';
    log('✅ Upload xong: ' + file.name, 'ok');
  } catch (err) {
    state.files[idx].status = 'error';
    log('❌ Lỗi upload ' + file.name + ': ' + err.message, 'err');
  }
  renderFileList();
}

function fileToBase64Raw(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload = function() { resolve(reader.result.split(',')[1]); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderFileList() {
  if (!state.files.length) { fileList.innerHTML = ''; return; }
  fileList.innerHTML = state.files.map(function(f) {
    let statusIcon = '';
    if (f.status === 'uploading') statusIcon = '⏳ Đang upload';
    else if (f.status === 'done') statusIcon = '✅ Sẵn sàng';
    else if (f.status === 'error') statusIcon = '❌ Lỗi';
    return '<div class="file-item ' + f.status + '">' +
      '<span class="fi-icon">📄</span>' +
      '<span class="fi-name">' + escapeHtml(f.fileName) + '</span>' +
      '<span class="fi-size">' + formatSize(f.size) + '</span>' +
      '<span class="fi-status">' + statusIcon + '</span>' +
      '</div>';
  }).join('');
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ============ TÁC VỤ ============
async function runTask(action) {
  const readyFiles = state.files.filter(function(f) { return f.status === 'done'; });
  if (!readyFiles.length) {
    alert('⚠️ Chưa có file nào được upload thành công.');
    return;
  }
  if (action === 'soSanhEBMS') {
    await runSoSanhTungTuyen(readyFiles);
    return;
  }

  const taskName = {
    trichXuatV1: 'Trích xuất nhân viên v1',
    trichXuatV2: 'Trích xuất nhân viên v2'
  }[action];

  showLoading('Đang chạy: ' + taskName + '...');
  log('▶️ Bắt đầu: ' + taskName + ' (' + readyFiles.length + ' file)');

  try {
    const params = new URLSearchParams();
    params.append('action', action);
    params.append('fileIds', JSON.stringify(readyFiles.map(function(f) { return f.fileId; })));

    // Ngày ghi nhận: để trống thì lấy ngày hôm nay
    const ngayVal = inputNgayDo.value ? formatDateVN(inputNgayDo.value) : todayVN();
    params.append('ngayDo', ngayVal);

    // Người đo: mặc định "Nguyễn Hoài Nam", cho phép gõ tay để đổi (chỉ dùng ở v1)
    if (action === 'trichXuatV1') {
      const nguoiDoVal = (inputNguoiDo.value || '').trim() || 'Nguyễn Hoài Nam';
      params.append('nguoiDo', nguoiDoVal);
    }

    const data = await jsonpRequest(params, 180000);
    if (!data.ok) throw new Error(data.error || 'Lỗi không xác định');
    log('✅ ' + taskName + ' xong!', 'ok');
    state.lastResult = data;
    state.lastType = action;
    renderResult(data, action);
  } catch (err) {
    log('❌ Lỗi ' + taskName + ': ' + err.message, 'err');
    alert('Lỗi: ' + err.message);
  } finally {
    hideLoading();
  }
}

async function runSoSanhTungTuyen(readyFiles) {
  showLoading('Đang chạy so sánh EBMS...');
  log('▶️ Bắt đầu: So sánh EBMS (' + readyFiles.length + ' file)');

  const routeFiles = [];
  for (const f of readyFiles) {
    // Normalize Unicode trước khi match regex (xử lý NFD vs NFC trên tên file)
    const nameNFC = String(f.fileName).normalize('NFC');
    const m = nameNFC.match(/Tuy[eếêề]n\s*0*(\d{1,3})/i);
    if (m) {
      routeFiles.push({ fileId: f.fileId, fileName: f.fileName, routeNumber: parseInt(m[1], 10) });
    } else {
      const m2 = nameNFC.match(/Tuy[eếêề]n\D*?(\d{1,3})/i);
      if (m2) {
        routeFiles.push({ fileId: f.fileId, fileName: f.fileName, routeNumber: parseInt(m2[1], 10) });
      } else {
        log('⚠️ Bỏ qua: ' + f.fileName + ' (không nhận diện được tuyến)', 'err');
      }
    }
  }
  if (!routeFiles.length) {
    hideLoading();
    alert('⚠️ Không có file nào có "Tuyến <số>" trong tên');
    return;
  }

  const allRoutes = {};
  const summary = [];

  for (let i = 0; i < routeFiles.length; i++) {
    const rf = routeFiles[i];
    showLoading('Đang chạy tuyến ' + rf.routeNumber + ' (' + (i+1) + '/' + routeFiles.length + ')...');
    log('⏳ Tuyến ' + rf.routeNumber + ' (' + (i+1) + '/' + routeFiles.length + ')...');

    try {
      const params = new URLSearchParams();
      params.append('action', 'soSanh1Tuyen');
      params.append('fileId', rf.fileId);
      params.append('routeNumber', String(rf.routeNumber));

      const data = await jsonpRequest(params, 60000);
      if (!data.ok) {
        log('❌ Tuyến ' + rf.routeNumber + ': ' + data.error, 'err');
        summary.push('❌ Tuyến ' + rf.routeNumber + ': ' + data.error);
        continue;
      }
      allRoutes[rf.routeNumber] = { results: data.results, ngayPhancong: data.ngayPhancong };
      summary.push('✅ Tuyến ' + rf.routeNumber + ' (ngày ' + data.ngayPhancong + '): ' + data.total + ' chuyến');
      log('✅ Tuyến ' + rf.routeNumber + ' xong (' + data.total + ' chuyến)', 'ok');
    } catch (err) {
      log('❌ Tuyến ' + rf.routeNumber + ': ' + err.message, 'err');
      summary.push('❌ Tuyến ' + rf.routeNumber + ': ' + err.message);
    }
  }

  hideLoading();
  log('✅ Hoàn tất so sánh EBMS', 'ok');

  state.lastResult = { ok: true, type: 'soSanhEBMS', summary: summary, routes: allRoutes };
  state.lastType = 'soSanhEBMS';
  renderResult(state.lastResult, 'soSanhEBMS');
}

// ============ PHÂN LOẠI DÒNG (dùng chung cho màu + đếm + lọc) ============
function categoryOf(loai) {
  if (loai.includes('KHỚP')) return 'KHỚP';
  if (loai.includes('LỆCH GIỜ KẾ HOẠCH')) return 'LỆCH GIỜ KẾ HOẠCH';
  if (loai.includes('LỆCH')) return 'LỆCH';
  if (loai.includes('KHÔNG CÓ PHÂN CÔNG')) return 'KHÔNG CÓ PHÂN CÔNG';
  if (loai.includes('THIẾU EBMS')) return 'THIẾU EBMS';
  return 'KHÁC';
}
function rowClassSoSanh(loai) {
  return {
    'KHỚP': 'row-ok',
    'LỆCH': 'row-warn',
    'LỆCH GIỜ KẾ HOẠCH': 'row-plan',
    'KHÔNG CÓ PHÂN CÔNG': 'row-miss-pc',
    'THIẾU EBMS': 'row-miss-ebms'
  }[categoryOf(loai)] || '';
}

// ============ RENDER: ĐIỀU PHỐI CHUNG ============
function renderResult(data, action) {
  noDataYetEl.style.display = 'none';
  lookupBarEl.style.display = 'flex';
  statCardsEl.style.display = 'flex';
  routeTabsEl.style.display = 'flex';
  resultCard.style.display = 'block';

  state.view = { activeRoute: 'all', activeFilter: 'all', searchText: '', shownCount: 0, totalCount: 0 };
  searchInputEl.value = '';

  if (action === 'soSanhEBMS') {
    resultTitle.textContent = '📊 Kết quả so sánh EBMS';
    buildStatCardsSoSanh(data.routes);
    buildRouteTabs(data.routes);
    buildFilterChipsSoSanh(data.routes);
  } else {
    resultTitle.textContent = action === 'trichXuatV1'
      ? '👥 Kết quả trích xuất NV v1'
      : '📋 Kết quả trích xuất NV v2';
    buildStatCardsTrichXuat(data.routes, action);
    buildRouteTabs(data.routes);
    filterChipsEl.style.display = 'none';
    filterChipsEl.innerHTML = '';
  }

  summaryEl.textContent = (data.summary || []).join('\n');
  renderActiveView();
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============ TAB THEO TUYẾN ============
function buildRouteTabs(routes) {
  const keys = Object.keys(routes).sort(function(a, b) { return Number(a) - Number(b); });
  let html = '<button class="route-tab active" data-route="all">Tất cả tuyến</button>';
  html += keys.map(function(r) {
    return '<button class="route-tab" data-route="' + r + '">Tuyến ' + r + '</button>';
  }).join('');
  routeTabsEl.innerHTML = html;
  routeTabsEl.querySelectorAll('.route-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      routeTabsEl.querySelectorAll('.route-tab').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      state.view.activeRoute = btn.dataset.route;
      renderActiveView();
    });
  });
}

// ============ CHIP LỌC (chỉ dùng cho So sánh EBMS) ============
function buildFilterChipsSoSanh(routes) {
  const counts = {};
  Object.keys(routes).forEach(function(r) {
    routes[r].results.forEach(function(row) {
      const cat = categoryOf(row.loai);
      counts[cat] = (counts[cat] || 0) + 1;
    });
  });
  const total = Object.keys(counts).reduce(function(s, k) { return s + counts[k]; }, 0);
  const categories = [
    { key: 'all', label: 'Tất cả' },
    { key: 'KHỚP', label: 'Khớp' },
    { key: 'LỆCH GIỜ KẾ HOẠCH', label: 'Lệch giờ KH' },
    { key: 'LỆCH', label: 'Lệch' },
    { key: 'KHÔNG CÓ PHÂN CÔNG', label: 'Thiếu PC' },
    { key: 'THIẾU EBMS', label: 'Thiếu EBMS' }
  ];
  filterChipsEl.style.display = 'flex';
  filterChipsEl.innerHTML = categories.map(function(c) {
    const n = c.key === 'all' ? total : (counts[c.key] || 0);
    if (c.key !== 'all' && n === 0) return '';
    return '<button class="filter-chip' + (c.key === 'all' ? ' active' : '') + '" data-filter="' + c.key + '">' +
      c.label + ' <span class="chip-count">' + n + '</span></button>';
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

// ============ THẺ THỐNG KÊ ============
function buildStatCardsSoSanh(routes) {
  const counts = {};
  let total = 0;
  Object.keys(routes).forEach(function(r) {
    routes[r].results.forEach(function(row) {
      const cat = categoryOf(row.loai);
      counts[cat] = (counts[cat] || 0) + 1;
      total++;
    });
  });
  const cards = [
    { label: 'Tổng số chuyến', value: total, tone: 'neutral' },
    { label: 'Khớp', value: counts['KHỚP'] || 0, tone: 'ok' },
    { label: 'Lệch giờ', value: (counts['LỆCH'] || 0) + (counts['LỆCH GIỜ KẾ HOẠCH'] || 0), tone: 'warn' },
    { label: 'Thiếu phân công', value: counts['KHÔNG CÓ PHÂN CÔNG'] || 0, tone: 'danger' },
    { label: 'Thiếu EBMS', value: counts['THIẾU EBMS'] || 0, tone: 'danger2' }
  ];
  statCardsEl.style.display = 'flex';
  statCardsEl.innerHTML = cards.map(function(c) {
    return '<div class="stat-card tone-' + c.tone + '"><div class="stat-value">' + c.value + '</div><div class="stat-label">' + c.label + '</div></div>';
  }).join('');
}

function buildStatCardsTrichXuat(routes, action) {
  let totalNV = 0;
  let totalViPham = 0;
  Object.keys(routes).forEach(function(r) {
    routes[r].forEach(function(row) {
      totalNV++;
      if (action === 'trichXuatV1' && row.viPham) totalViPham++;
    });
  });
  const cards = [
    { label: 'Tổng lượt nhân viên', value: totalNV, tone: 'neutral' },
    { label: 'Số tuyến', value: Object.keys(routes).length, tone: 'neutral' }
  ];
  if (action === 'trichXuatV1') {
    cards.push({ label: 'Vi phạm', value: totalViPham, tone: 'danger' });
  }
  statCardsEl.style.display = 'flex';
  statCardsEl.innerHTML = cards.map(function(c) {
    return '<div class="stat-card tone-' + c.tone + '"><div class="stat-value">' + c.value + '</div><div class="stat-label">' + c.label + '</div></div>';
  }).join('');
}

// ============ RENDER BẢNG THEO BỘ LỌC HIỆN TẠI ============
function renderActiveView() {
  if (!state.lastResult) return;
  const action = state.lastType;
  const routes = state.lastResult.routes;
  const routeKeys = Object.keys(routes).sort(function(a, b) { return Number(a) - Number(b); });
  const keysToRender = state.view.activeRoute === 'all' ? routeKeys : [state.view.activeRoute];

  if (action === 'soSanhEBMS') {
    renderSoSanhFiltered(routes, keysToRender);
  } else {
    renderTrichXuatFiltered(routes, keysToRender, action);
  }
  updateLookupMeta();
}

function renderSoSanhFiltered(routes, keys) {
  const searchQ = normalizeSearch(state.view.searchText);
  const activeFilter = state.view.activeFilter;
  const htmlParts = [];
  let shownCount = 0, totalCount = 0;

  keys.forEach(function(r) {
    const info = routes[r];
    let rowsHtml = '';
    info.results.forEach(function(row) {
      totalCount++;
      const cat = categoryOf(row.loai);
      if (activeFilter !== 'all' && cat !== activeFilter) return;
      if (searchQ) {
        const haystack = normalizeSearch([
          row.loai, row.khDi, row.khDen, row.khXe, row.thXe, row.thDi, row.thDen,
          row.benDau, row.trangThaiEBMS, row.lichChayPC, row.xePC, row.benXuatPhatPC,
          row.gioDiPC, row.gioDenPC, row.ghi, r
        ].join(' '));
        if (haystack.indexOf(searchQ) === -1) return;
      }
      shownCount++;
      const cls = rowClassSoSanh(row.loai);
      rowsHtml += '<tr class="' + cls + '">' +
        '<td>' + row.loai + '</td>' +
        '<td>' + row.khDi + '</td><td>' + row.khDen + '</td><td>' + row.khXe + '</td>' +
        '<td>' + row.thXe + '</td><td>' + row.thDi + '</td><td>' + row.thDen + '</td>' +
        '<td>' + row.benDau + '</td><td>' + row.trangThaiEBMS + '</td>' +
        '<td>' + row.lichChayPC + '</td><td>' + row.xePC + '</td><td>' + row.benXuatPhatPC + '</td>' +
        '<td>' + row.gioDiPC + '</td><td>' + row.gioDenPC + '</td>' +
        '<td>' + row.chenhLechDi + '</td><td>' + row.chenhLechDen + '</td><td>' + row.soBen + '</td>' +
        '<td class="notes">' + escapeHtml(row.ghi) + '</td>' +
        '</tr>';
    });
    if (!rowsHtml) return;
    htmlParts.push(
      '<h3 class="route-heading">🚌 Tuyến ' + r + ' — Ngày ' + info.ngayPhancong + '</h3>' +
      '<table><thead><tr>' +
      ['Loại','KH Đi','KH Đến','KH Xe','TH Xe','TH Đi','TH Đến','Bến đầu','TT EBMS',
       'Lịch chạy PC','Xe PC','Bến PC','Giờ đi PC','Giờ đến PC','Lệch Đi','Lệch Về','So bến','Ghi chú']
        .map(function(c) { return '<th>' + c + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rowsHtml + '</tbody></table>'
    );
  });

  resultContent.innerHTML = htmlParts.length ? htmlParts.join('') :
    '<p class="empty-hint">Không có dòng nào khớp với bộ lọc hiện tại.</p>';

  state.view.shownCount = shownCount;
  state.view.totalCount = totalCount;
}

function renderTrichXuatFiltered(routes, keys, action) {
  const searchQ = normalizeSearch(state.view.searchText);
  const htmlParts = [];
  let shownCount = 0, totalCount = 0;

  keys.forEach(function(r) {
    const list = routes[r];
    let rowsHtml = '';
    list.forEach(function(row) {
      totalCount++;
      if (searchQ) {
        const haystack = normalizeSearch([row.ten, row.chucVu, row.ngay, r, action === 'trichXuatV1' ? row.nguoiDo : ''].join(' '));
        if (haystack.indexOf(searchQ) === -1) return;
      }
      shownCount++;
      const cls = row.isAmbiguous ? 'row-ambiguous' : '';
      rowsHtml += '<tr class="' + cls + '">';
      if (action === 'trichXuatV1') {
        rowsHtml += '<td>' + row.ngay + '</td><td>' + row.tuyen + '</td><td>' + row.gioDi + '</td>' +
          '<td>' + row.gioXuatBen + '</td><td>' + row.thoiGianDo + '</td>' +
          '<td style="text-align:left">' + escapeHtml(row.ten) + '</td>' +
          '<td>' + row.chucVu + '</td>' +
          '<td>' + (row.trangThai ? '✅' : '⬜') + '</td>' +
          '<td>' + (row.viPham ? '⚠️' : '⬜') + '</td>' +
          '<td>' + escapeHtml(row.nguoiDo) + '</td>';
      } else {
        rowsHtml += '<td>' + row.ngay + '</td><td>' + row.tuyen + '</td>' +
          '<td style="text-align:left">' + escapeHtml(row.ten) + '</td>' +
          '<td>' + row.chucVu + '</td>' +
          '<td>' + (row.check1 ? '✅' : '⬜') + '</td>' +
          '<td>' + (row.check2 ? '✅' : '⬜') + '</td>';
      }
      rowsHtml += '</tr>';
    });
    if (!rowsHtml) return;
    const headCols = action === 'trichXuatV1'
      ? ['Ngày','Tuyến','Giờ đi','Giờ xuất bến','Thời gian đo','Tên','Chức vụ','Trạng thái','Vi phạm','Người đo']
      : ['Ngày','Tuyến','Tên','Chức vụ','Check 1','Check 2'];
    htmlParts.push(
      '<h3 class="route-heading">🚌 Tuyến ' + r + ' — ' + list.length + ' nhân viên</h3>' +
      '<table><thead><tr>' + headCols.map(function(c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' + rowsHtml + '</tbody></table>'
    );
  });

  resultContent.innerHTML = htmlParts.length ? htmlParts.join('') :
    '<p class="empty-hint">Không có dòng nào khớp với tìm kiếm.</p>';

  state.view.shownCount = shownCount;
  state.view.totalCount = totalCount;
}

// ============ EXPORT CSV (xuất toàn bộ dữ liệu, không phụ thuộc bộ lọc đang xem) ============
function exportCSV(data, action) {
  const rows = [];
  if (action === 'soSanhEBMS') {
    rows.push(['Tuyến','Ngày','Loại','KH Đi','KH Đến','KH Xe','TH Xe','TH Đi','TH Đến',
               'Bến đầu','TT EBMS','Lịch chạy PC','Xe PC','Bến PC','Giờ đi PC','Giờ đến PC',
               'Lệch Đi','Lệch Về','So bến','Ghi chú']);
    for (const r of Object.keys(data.routes)) {
      const info = data.routes[r];
      for (const row of info.results) {
        rows.push([r, info.ngayPhancong, row.loai, row.khDi, row.khDen, row.khXe,
                   row.thXe, row.thDi, row.thDen, row.benDau, row.trangThaiEBMS,
                   row.lichChayPC, row.xePC, row.benXuatPhatPC, row.gioDiPC, row.gioDenPC,
                   row.chenhLechDi, row.chenhLechDen, row.soBen, row.ghi]);
      }
    }
  } else if (action === 'trichXuatV1') {
    rows.push(['Ngày','Tuyến','Giờ đi','Giờ xuất bến','Thời gian đo','Tên','Chức vụ',
               'Trạng thái','Vi phạm','Người đo']);
    for (const r of Object.keys(data.routes)) {
      for (const row of data.routes[r]) {
        rows.push([row.ngay, row.tuyen, row.gioDi, row.gioXuatBen, row.thoiGianDo,
                   row.ten, row.chucVu, row.trangThai ? 'TRUE' : 'FALSE',
                   row.viPham ? 'TRUE' : 'FALSE', row.nguoiDo]);
      }
    }
  } else {
    rows.push(['Ngày','Tuyến','Tên','Chức vụ','Check 1','Check 2']);
    for (const r of Object.keys(data.routes)) {
      for (const row of data.routes[r]) {
        rows.push([row.ngay, row.tuyen, row.ten, row.chucVu,
                   row.check1 ? 'TRUE' : 'FALSE', row.check2 ? 'TRUE' : 'FALSE']);
      }
    }
  }
  const csv = rows.map(function(row) {
    return row.map(function(cell) {
      const s = String(cell == null ? '' : cell);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',');
  }).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = state.lastType + '_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  log('⬇️ Đã xuất CSV', 'ok');
}

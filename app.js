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
  lastType: null
};

// ============ DOM (gán trong window.onload) ============
let dropzone, fileInput, fileList, logEl, loading, loadingText;
let resultCard, resultTitle, resultContent, summaryEl;
let loginNotice, mainContent, userInfo, userAvatar, userName;
let btnLogout, btnGoogleLogin;

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

  setupOtherListeners();

  if (typeof google === 'undefined' || !google.accounts) {
    log('⚠️ Không load được Google Sign-In. Đợi vài giây rồi refresh trang.', 'err');
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: function(resp) {
      if (resp.error) {
        log('❌ Lỗi đăng nhập: ' + resp.error, 'err');
        return;
      }
      state.accessToken = resp.access_token;
      fetchUserInfo();
    }
  });

  btnGoogleLogin.addEventListener('click', function() {
    if (!tokenClient) {
      log('⚠️ Chưa load được Google Sign-In, đợi vài giây rồi thử lại', 'err');
      return;
    }
    tokenClient.requestAccessToken();
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
    resultCard.style.display = 'none';
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
    loginNotice.style.display = 'block';
    fileList.innerHTML = '';
    resultCard.style.display = 'none';
    log('👋 Đã đăng xuất');
  });
}

async function fetchUserInfo() {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': 'Bearer ' + state.accessToken }
    });
    if (!res.ok) throw new Error('Không lấy được thông tin user');
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
  mainContent.style.flexDirection = 'column';
  mainContent.style.gap = '20px';
  btnGoogleLogin.style.display = 'none';
  userAvatar.src = info.picture || '';
  userName.textContent = info.name || info.email || '';
  userInfo.style.display = 'flex';
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
    // FIX: Normalize Unicode trước khi match regex (xử lý NFD vs NFC)
    const nameNFC = String(f.fileName).normalize('NFC');
    const m = nameNFC.match(/Tuy[eếêề]n\s*0*(\d{1,3})/i);
    if (m) {
      routeFiles.push({ fileId: f.fileId, fileName: f.fileName, routeNumber: parseInt(m[1], 10) });
    } else {
      // Fallback: thử tìm số sau chữ "Tuyến" bằng cách linh hoạt hơn (cho trường hợp có ký tự đặc biệt)
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

// ============ RENDER KẾT QUẢ ============
function renderResult(data, action) {
  resultCard.style.display = 'block';
  resultCard.scrollIntoView({ behavior: 'smooth' });
  if (action === 'soSanhEBMS') {
    resultTitle.textContent = '📊 Kết quả So sánh EBMS';
    summaryEl.textContent = (data.summary || []).join('\n');
    renderSoSanh(data.routes);
  } else {
    resultTitle.textContent = action === 'trichXuatV1'
      ? '👥 Kết quả Trích xuất NV v1'
      : '📋 Kết quả Trích xuất NV v2';
    summaryEl.textContent = (data.summary || []).join('\n');
    renderTrichXuat(data.routes, action);
  }
}

const SS = { routes: null, route: null, filter: 'all', q: '' };
const SS_FILTERS = [
  ['all', 'Tất cả'], ['bad', '🚨 Bất thường'], ['ok', '✅ Khớp'], ['warn', '⚠️ Lệch'],
  ['plan', '🟠 Lệch giờ KH'], ['nopc', '🔴 Không có PC'], ['noebms', '🟡 Thiếu EBMS']
];

function ssKind(loai) {
  if (loai.includes('KHỚP')) return 'ok';
  if (loai.includes('GIỜ KẾ HOẠCH')) return 'plan';
  if (loai.includes('KHÔNG CÓ PHÂN CÔNG')) return 'nopc';
  if (loai.includes('THIẾU EBMS')) return 'noebms';
  return 'warn';
}
function ssNorm(s) {
  return String(s == null ? '' : s).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
}
function ssEmpty(v) { return v == null || v === '' || v === '-' || v === 'N/A'; }
function ssTxt(v) { return ssEmpty(v) ? '<span class="muted">–</span>' : escapeHtml(v); }
function ssRange(a, b) {
  if (ssEmpty(a) && ssEmpty(b)) return '<span class="muted">–</span>';
  return '<b>' + (ssEmpty(a) ? '–' : escapeHtml(a)) + '</b> → <b>' + (ssEmpty(b) ? '–' : escapeHtml(b)) + '</b>';
}

function renderSoSanh(routes) {
  if (!routes || typeof routes !== 'object' || !Object.keys(routes).length) {
    resultContent.innerHTML = '<p style="color:#999;padding:20px;text-align:center">Không có dữ liệu</p>';
    return;
  }
  const keys = Object.keys(routes).sort(function(a, b) { return Number(a) - Number(b); });
  SS.routes = routes; SS.route = keys[0]; SS.filter = 'all'; SS.q = '';
  resultContent.innerHTML =
    '<div id="ssTabs" class="ss-tabs"></div>' +
    '<div class="ss-tools"><input id="ssSearch" class="ss-search" type="search" placeholder="🔍 Tìm xe, giờ, bến, ghi chú...">' +
    '<div id="ssChips" class="ss-chips"></div></div>' +
    '<div id="ssInfo" class="ss-info"></div><div id="ssTable" class="ss-wrap"></div>';
  document.getElementById('ssSearch').addEventListener('input', function(e) { SS.q = e.target.value; drawSoSanh(); });
  document.getElementById('ssTabs').onclick = function(e) {
    const b = e.target.closest('[data-r]');
    if (b) { SS.route = b.dataset.r; SS.filter = 'all'; drawSoSanh(); }
  };
  document.getElementById('ssChips').onclick = function(e) {
    const b = e.target.closest('[data-f]');
    if (b) { SS.filter = b.dataset.f; drawSoSanh(); }
  };
  drawSoSanh();
}

function drawSoSanh() {
  const keys = Object.keys(SS.routes).sort(function(a, b) { return Number(a) - Number(b); });
  document.getElementById('ssTabs').innerHTML = keys.map(function(k) {
    const bad = SS.routes[k].results.filter(function(r) { return ssKind(r.loai) !== 'ok'; }).length;
    return '<button class="ss-tab' + (k === SS.route ? ' active' : '') + '" data-r="' + k + '">Tuyến ' + k +
      ' <span class="ss-badge' + (bad ? ' bad' : '') + '">' + (bad ? bad + ' bất thường' : 'ổn') + '</span></button>';
  }).join('');

  const info = SS.routes[SS.route];
  const q = ssNorm(SS.q).trim();
  const base = info.results.filter(function(r) {
    if (!q) return true;
    return ssNorm([r.loai, r.xePC, r.thXe, r.khXe, r.benDau, r.benXuatPhatPC, r.lichChayPC,
                   r.khDi, r.thDi, r.gioDiPC, r.ghi].join(' ')).indexOf(q) >= 0;
  });
  const cnt = { all: base.length, bad: 0, ok: 0, warn: 0, plan: 0, nopc: 0, noebms: 0 };
  base.forEach(function(r) { const k = ssKind(r.loai); cnt[k]++; if (k !== 'ok') cnt.bad++; });
  document.getElementById('ssChips').innerHTML = SS_FILTERS.map(function(f) {
    return '<button class="ss-chip' + (f[0] === SS.filter ? ' active' : '') + '" data-f="' + f[0] + '">' +
      f[1] + ' <b>' + cnt[f[0]] + '</b></button>';
  }).join('');

  const rows = base.filter(function(r) {
    const k = ssKind(r.loai);
    return SS.filter === 'all' || (SS.filter === 'bad' ? k !== 'ok' : k === SS.filter);
  });
  document.getElementById('ssInfo').textContent =
    'Ngày phân công: ' + info.ngayPhancong + '  ·  Đang hiện ' + rows.length + '/' + info.results.length + ' chuyến';

  if (!rows.length) {
    document.getElementById('ssTable').innerHTML = '<p class="muted" style="padding:24px;text-align:center">Không có dòng nào khớp bộ lọc</p>';
    return;
  }
  let html = '<table class="ss-table"><thead><tr>' +
    '<th>Loại</th><th>Bến</th><th class="eb">EBMS · Kế hoạch</th><th class="eb">EBMS · Thực hiện</th>' +
    '<th class="pc">Phân công</th><th>Lệch (Đi / Đến)</th><th>Xe</th><th>Ghi chú</th></tr></thead><tbody>';
  for (const row of rows) {
    const k = ssKind(row.loai);
    const ben = !ssEmpty(row.benDau) ? row.benDau : row.benXuatPhatPC;
    const benLech = String(row.soBen).indexOf('Lệch') >= 0;
    html += '<tr class="' + rowClassSoSanh(row.loai) + ' k-' + k + '">' +
      '<td class="nw"><span class="tag t-' + k + '">' + escapeHtml(row.loai) + '</span></td>' +
      '<td>' + ssTxt(ben) + (benLech ? '<span class="sub bad">PC: ' + escapeHtml(row.benXuatPhatPC) + '</span>' : '') + '</td>' +
      '<td class="nw">' + ssRange(row.khDi, row.khDen) + '</td>' +
      '<td class="nw">' + ssRange(row.thDi, row.thDen) + '<span class="sub">' + ssTxt(row.trangThaiEBMS) + '</span></td>' +
      '<td class="nw">' + ssRange(row.gioDiPC, row.gioDenPC) + '<span class="sub">KH: ' + ssTxt(row.lichChayPC) + '</span></td>' +
      '<td class="nw">' + ssTxt(row.chenhLechDi) + ' / ' + ssTxt(row.chenhLechDen) + '</td>' +
      '<td class="nw"><span class="sub">PC</span>' + ssTxt(row.xePC) + '<span class="sub">EBMS</span>' + ssTxt(row.thXe) + '</td>' +
      '<td>' + ssTxt(row.ghi) + '</td></tr>';
  }
  document.getElementById('ssTable').innerHTML = html + '</tbody></table>';
}

function rowClassSoSanh(loai) {
  if (loai.includes('KHỚP')) return 'row-ok';
  if (loai.includes('LỆCH') && !loai.includes('GIỜ KẾ HOẠCH')) return 'row-warn';
  if (loai.includes('LỆCH GIỜ KẾ HOẠCH')) return 'row-plan';
  if (loai.includes('KHÔNG CÓ PHÂN CÔNG')) return 'row-miss-pc';
  if (loai.includes('THIẾU EBMS')) return 'row-miss-ebms';
  return '';
}

function renderTrichXuat(routes, action) {
  if (!routes || typeof routes !== 'object') {
    resultContent.innerHTML = '<p style="color:#999;padding:20px;text-align:center">Không có dữ liệu</p>';
    return;
  }
  const routeKeys = Object.keys(routes).sort(function(a, b) { return Number(a) - Number(b); });
  if (!routeKeys.length) {
    resultContent.innerHTML = '<p style="color:#999;padding:20px;text-align:center">Không có kết quả</p>';
    return;
  }
  let html = '';
  for (const r of routeKeys) {
    const list = routes[r];
    html += '<h3 style="margin:16px 0 8px;color:#1F3864">🚌 Tuyến ' + r + ' — ' + list.length + ' nhân viên</h3>';
    html += '<table><thead><tr>';
    if (action === 'trichXuatV1') {
      html += '<th>Ngày</th><th>Tuyến</th><th>Giờ đi</th><th>Giờ xuất bến</th><th>Thời gian đo</th><th>Tên</th><th>Chức vụ</th><th>Trạng thái</th><th>Vi phạm</th><th>Người đo</th>';
    } else {
      html += '<th>Ngày</th><th>Tuyến</th><th>Tên</th><th>Chức vụ</th><th>Check 1</th><th>Check 2</th>';
    }
    html += '</tr></thead><tbody>';
    for (const row of list) {
      const cls = row.isAmbiguous ? 'row-ambiguous' : '';
      html += '<tr class="' + cls + '">';
      if (action === 'trichXuatV1') {
        html += '<td>' + row.ngay + '</td><td>' + row.tuyen + '</td><td>' + row.gioDi + '</td>';
        html += '<td>' + row.gioXuatBen + '</td><td>' + row.thoiGianDo + '</td>';
        html += '<td style="text-align:left">' + escapeHtml(row.ten) + '</td>';
        html += '<td>' + row.chucVu + '</td>';
        html += '<td>' + (row.trangThai ? '✅' : '⬜') + '</td>';
        html += '<td>' + (row.viPham ? '⚠️' : '⬜') + '</td>';
        html += '<td>' + escapeHtml(row.nguoiDo) + '</td>';
      } else {
        html += '<td>' + row.ngay + '</td><td>' + row.tuyen + '</td>';
        html += '<td style="text-align:left">' + escapeHtml(row.ten) + '</td>';
        html += '<td>' + row.chucVu + '</td>';
        html += '<td>' + (row.check1 ? '✅' : '⬜') + '</td>';
        html += '<td>' + (row.check2 ? '✅' : '⬜') + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
  }
  resultContent.innerHTML = html;
}

// ============ EXPORT CSV ============
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

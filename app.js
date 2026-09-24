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
  // Gán DOM elements
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

  // Setup các listener khác
  setupOtherListeners();

  // Setup Google Sign-In
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
  // Dropzone
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

  // Clear files
  document.getElementById('btnClearFiles').addEventListener('click', function() {
    if (!state.files.length) return;
    if (!confirm('Xóa danh sách file đã upload? File trên Drive vẫn còn.')) return;
    state.files = [];
    renderFileList();
    log('🗑️ Đã xóa danh sách file khỏi giao diện');
  });

  // Task buttons
  document.querySelectorAll('.task-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { runTask(btn.dataset.action); });
  });

  // Export CSV
  document.getElementById('btnExportCSV').addEventListener('click', function() {
    if (!state.lastResult) return;
    exportCSV(state.lastResult, state.lastType);
  });

  // Close result
  document.getElementById('btnCloseResult').addEventListener('click', function() {
    resultCard.style.display = 'none';
  });

  // Logout
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
    log('✅ Upload xong: ' + file.name + ' (ID: ' + data.id.substring(0, 12) + '...)', 'ok');
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
  const taskName = {
    soSanhEBMS: 'So sánh EBMS',
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

function renderSoSanh(routes) {
  const routeKeys = Object.keys(routes).sort(function(a, b) { return Number(a) - Number(b); });
  let html = '';
  for (const r of routeKeys) {
    const info = routes[r];
    html += '<h3 style="margin:16px 0 8px;color:#1F3864">🚌 Tuyến ' + r + ' — Ngày ' + info.ngayPhancong + '</h3>';
    html += '<table><thead><tr>';
    const cols = ['Loại','KH Đi','KH Đến','KH Xe','TH Xe','TH Đi','TH Đến','Bến đầu','TT EBMS',
                  'Lịch chạy PC','Xe PC','Bến PC','Giờ đi PC','Giờ đến PC','Lệch Đi','Lệch Về','So bến','Ghi chú'];
    html += cols.map(function(c) { return '<th>' + c + '</th>'; }).join('');
    html += '</tr></thead><tbody>';
    for (const row of info.results) {
      const cls = rowClassSoSanh(row.loai);
      html += '<tr class="' + cls + '">';
      html += '<td>' + row.loai + '</td>';
      html += '<td>' + row.khDi + '</td><td>' + row.khDen + '</td><td>' + row.khXe + '</td>';
      html += '<td>' + row.thXe + '</td><td>' + row.thDi + '</td><td>' + row.thDen + '</td>';
      html += '<td>' + row.benDau + '</td><td>' + row.trangThaiEBMS + '</td>';
      html += '<td>' + row.lichChayPC + '</td><td>' + row.xePC + '</td><td>' + row.benXuatPhatPC + '</td>';
      html += '<td>' + row.gioDiPC + '</td><td>' + row.gioDenPC + '</td>';
      html += '<td>' + row.chenhLechDi + '</td><td>' + row.chenhLechDen + '</td><td>' + row.soBen + '</td>';
      html += '<td class="notes">' + escapeHtml(row.ghi) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
  }
  resultContent.innerHTML = html;
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
  const routeKeys = Object.keys(routes).sort(function(a, b) { return Number(a) - Number(b); });
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

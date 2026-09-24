// ============ CẤU HÌNH ============
const API_URL = 'https://script.google.com/macros/s/AKfycbyNsgSGcAqHXozITTRJKttOSWhG2yYSmYt9KXrQI0bw2CTBS0yCQApPQ_quviC50N2M/exec';

// ============ STATE ============
const state = {
  files: [],
  lastResult: null,
  lastType: null
};

// ============ DOM ============
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const logEl = document.getElementById('log');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loadingText');
const resultCard = document.getElementById('resultCard');
const resultTitle = document.getElementById('resultTitle');
const resultContent = document.getElementById('resultContent');
const summaryEl = document.getElementById('summary');

// ============ LOG ============
function log(msg, type = 'info') {
  const time = new Date().toLocaleTimeString('vi-VN');
  const cls = type === 'ok' ? 'log-ok' : type === 'err' ? 'log-err' : 'log-info';
  const line = document.createElement('div');
  line.innerHTML = `<span class="log-time">${time}</span><span class="${cls}">${msg}</span>`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

// ============ LOADING ============
function showLoading(text) {
  loadingText.textContent = text || 'Đang xử lý...';
  loading.style.display = 'flex';
}
function hideLoading() {
  loading.style.display = 'none';
}

// ============ JSONP HELPER ============
// Vì Apps Script không hỗ trợ CORS, ta dùng JSONP: chèn <script src="...&callback=fn">
// Trình duyệt sẽ gọi callback khi response trả về.
let _jsonpCounter = 0;
function jsonpRequest(params, timeoutMs) {
  return new Promise((resolve, reject) => {
    timeoutMs = timeoutMs || 120000; // 2 phút cho tác vụ nặng (so sánh EBMS)
    const cbName = '__jsonp_cb_' + (++_jsonpCounter) + '_' + Date.now();
    const url = API_URL + '?callback=' + cbName + '&' + params.toString();

    let done = false;
    const script = document.createElement('script');

    const cleanup = () => {
      if (done) return;
      done = true;
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
      clearTimeout(timer);
    };

    window[cbName] = function(data) {
      cleanup();
      resolve(data);
    };

    script.onerror = function() {
      cleanup();
      reject(new Error('Không kết nối được API (kiểm tra URL Web App hoặc mạng)'));
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Hết thời gian chờ (' + Math.round(timeoutMs/1000) + 's)'));
    }, timeoutMs);

    script.src = url;
    document.body.appendChild(script);
  });
}

// ============ UPLOAD ============
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', e => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', e => handleFiles(e.target.files));

function handleFiles(filesInput) {
  const files = Array.from(filesInput).filter(f =>
    f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls')
  );
  if (!files.length) {
    log('⚠️ Chỉ nhận file .xlsx hoặc .xls', 'err');
    return;
  }
  files.forEach(uploadFile);
}

async function uploadFile(file) {
  log(`📤 Đang upload: ${file.name} (${formatSize(file.size)})`);
  const idx = state.files.length;
  state.files.push({ fileName: file.name, size: file.size, status: 'uploading' });
  renderFileList();

  try {
    const base64 = await fileToBase64(file);
    const params = new URLSearchParams();
    params.append('action', 'upload');
    params.append('filename', file.name);
    params.append('mime', file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    params.append('data', base64);

    const data = await jsonpRequest(params, 60000);
    if (!data.ok) throw new Error(data.error || 'Upload thất bại');

    state.files[idx].fileId = data.fileId;
    state.files[idx].status = 'done';
    log(`✅ Upload xong: ${file.name}`, 'ok');
  } catch (err) {
    state.files[idx].status = 'error';
    log(`❌ Lỗi upload ${file.name}: ${err.message}`, 'err');
  }
  renderFileList();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderFileList() {
  if (!state.files.length) {
    fileList.innerHTML = '';
    return;
  }
  fileList.innerHTML = state.files.map(f => {
    let statusIcon = '';
    if (f.status === 'uploading') statusIcon = '⏳ Đang upload';
    else if (f.status === 'done') statusIcon = '✅ Sẵn sàng';
    else if (f.status === 'error') statusIcon = '❌ Lỗi';
    return `
      <div class="file-item ${f.status}">
        <span class="fi-icon">📄</span>
        <span class="fi-name">${escapeHtml(f.fileName)}</span>
        <span class="fi-size">${formatSize(f.size)}</span>
        <span class="fi-status">${statusIcon}</span>
      </div>`;
  }).join('');
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

document.getElementById('btnClearFiles').addEventListener('click', () => {
  if (!state.files.length) return;
  if (!confirm('Xóa danh sách file đã upload? File trên Drive vẫn còn.')) return;
  state.files = [];
  renderFileList();
  log('🗑️ Đã xóa danh sách file khỏi giao diện');
});

// ============ TÁC VỤ ============
document.querySelectorAll('.task-btn').forEach(btn => {
  btn.addEventListener('click', () => runTask(btn.dataset.action));
});

async function runTask(action) {
  const readyFiles = state.files.filter(f => f.status === 'done');
  if (!readyFiles.length) {
    alert('⚠️ Chưa có file nào được upload thành công.');
    return;
  }

  const taskName = {
    soSanhEBMS: 'So sánh EBMS',
    trichXuatV1: 'Trích xuất nhân viên v1',
    trichXuatV2: 'Trích xuất nhân viên v2'
  }[action];

  showLoading(`Đang chạy: ${taskName}...`);
  log(`▶️ Bắt đầu: ${taskName} (${readyFiles.length} file)`);

  try {
    const params = new URLSearchParams();
    params.append('action', action);
    params.append('fileIds', JSON.stringify(readyFiles.map(f => f.fileId)));

    const data = await jsonpRequest(params, 180000); // 3 phút cho so sánh EBMS

    if (!data.ok) throw new Error(data.error || 'Lỗi không xác định');

    log(`✅ ${taskName} xong!`, 'ok');
    state.lastResult = data;
    state.lastType = action;
    renderResult(data, action);
  } catch (err) {
    log(`❌ Lỗi ${taskName}: ${err.message}`, 'err');
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
  const routeKeys = Object.keys(routes).sort((a, b) => Number(a) - Number(b));
  let html = '';

  for (const r of routeKeys) {
    const info = routes[r];
    html += `<h3 style="margin:16px 0 8px;color:#1F3864">🚌 Tuyến ${r} — Ngày ${info.ngayPhancong}</h3>`;
    html += '<table><thead><tr>';
    const cols = ['Loại','KH Đi','KH Đến','KH Xe','TH Xe','TH Đi','TH Đến','Bến đầu','TT EBMS',
                  'Lịch chạy PC','Xe PC','Bến PC','Giờ đi PC','Giờ đến PC','Lệch Đi','Lệch Về','So bến','Ghi chú'];
    html += cols.map(c => `<th>${c}</th>`).join('');
    html += '</tr></thead><tbody>';

    for (const row of info.results) {
      const cls = rowClassSoSanh(row.loai);
      html += `<tr class="${cls}">`;
      html += `<td>${row.loai}</td>`;
      html += `<td>${row.khDi}</td><td>${row.khDen}</td><td>${row.khXe}</td>`;
      html += `<td>${row.thXe}</td><td>${row.thDi}</td><td>${row.thDen}</td>`;
      html += `<td>${row.benDau}</td><td>${row.trangThaiEBMS}</td>`;
      html += `<td>${row.lichChayPC}</td><td>${row.xePC}</td><td>${row.benXuatPhatPC}</td>`;
      html += `<td>${row.gioDiPC}</td><td>${row.gioDenPC}</td>`;
      html += `<td>${row.chenhLechDi}</td><td>${row.chenhLechDen}</td><td>${row.soBen}</td>`;
      html += `<td class="notes">${escapeHtml(row.ghi)}</td>`;
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
  const routeKeys = Object.keys(routes).sort((a, b) => Number(a) - Number(b));
  let html = '';

  for (const r of routeKeys) {
    const list = routes[r];
    html += `<h3 style="margin:16px 0 8px;color:#1F3864">🚌 Tuyến ${r} — ${list.length} nhân viên</h3>`;
    html += '<table><thead><tr>';
    if (action === 'trichXuatV1') {
      html += '<th>Ngày</th><th>Tuyến</th><th>Giờ đi</th><th>Giờ xuất bến</th><th>Thời gian đo</th><th>Tên</th><th>Chức vụ</th><th>Trạng thái</th><th>Vi phạm</th><th>Người đo</th>';
    } else {
      html += '<th>Ngày</th><th>Tuyến</th><th>Tên</th><th>Chức vụ</th><th>Check 1</th><th>Check 2</th>';
    }
    html += '</tr></thead><tbody>';

    for (const row of list) {
      const cls = row.isAmbiguous ? 'row-ambiguous' : '';
      html += `<tr class="${cls}">`;
      if (action === 'trichXuatV1') {
        html += `<td>${row.ngay}</td><td>${row.tuyen}</td><td>${row.gioDi}</td>`;
        html += `<td>${row.gioXuatBen}</td><td>${row.thoiGianDo}</td>`;
        html += `<td style="text-align:left">${escapeHtml(row.ten)}</td>`;
        html += `<td>${row.chucVu}</td>`;
        html += `<td>${row.trangThai ? '✅' : '⬜'}</td>`;
        html += `<td>${row.viPham ? '⚠️' : '⬜'}</td>`;
        html += `<td>${escapeHtml(row.nguoiDo)}</td>`;
      } else {
        html += `<td>${row.ngay}</td><td>${row.tuyen}</td>`;
        html += `<td style="text-align:left">${escapeHtml(row.ten)}</td>`;
        html += `<td>${row.chucVu}</td>`;
        html += `<td>${row.check1 ? '✅' : '⬜'}</td>`;
        html += `<td>${row.check2 ? '✅' : '⬜'}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
  }
  resultContent.innerHTML = html;
}

// ============ EXPORT CSV ============
document.getElementById('btnExportCSV').addEventListener('click', () => {
  if (!state.lastResult) return;
  exportCSV(state.lastResult, state.lastType);
});

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

  const csv = rows.map(row =>
    row.map(cell => {
      const s = String(cell == null ? '' : cell);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')
  ).join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.lastType}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  log('⬇️ Đã xuất CSV', 'ok');
}

document.getElementById('btnCloseResult').addEventListener('click', () => {
  resultCard.style.display = 'none';
});

// ============ KHỞI TẠO ============
log('🚀 Web đã sẵn sàng. Kéo thả file Excel vào khung phía trên để bắt đầu.');

const video = document.getElementById('video');
const openmvImage = document.getElementById('openmvImage');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const countList = document.getElementById('countList');
const statusText = document.getElementById('statusText');
const cameraMeta = document.getElementById('cameraMeta');
const perfMeta = document.getElementById('perfMeta');
const cameraType = document.getElementById('cameraType');
const openmvPanel = document.getElementById('openmvPanel');
const openmvConnStatus = document.getElementById('openmvConnStatus');
let stream = null;
let timer = null;
let frameTimer = null;
let durationTimer = null;
let startAt = null;
let serverCameraStartedAt = null;

async function postApi(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : null,
  });
  return res.json();
}

function formatDuration(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function drawBoxes(boxes = []) {
  const target = cameraType.value === 'openmv' ? openmvImage : video;
  overlay.width = target.clientWidth || video.clientWidth;
  overlay.height = target.clientHeight || video.clientHeight;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.lineWidth = 2;
  ctx.font = '14px sans-serif';
  boxes.forEach((b) => {
    ctx.strokeStyle = '#00e1ff';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    const text = `${b.label} ${(b.conf * 100).toFixed(0)}%`;
    ctx.fillRect(b.x, b.y - 20, ctx.measureText(text).width + 8, 20);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, b.x + 4, b.y - 6);
  });
}

function renderCounts(counts = {}) {
  countList.innerHTML = '';
  const entries = Object.entries(counts);
  if (!entries.length) {
    countList.innerHTML = '<li class="list-group-item">暂无检测数据</li>';
    return;
  }
  entries.forEach(([k, v]) => {
    const item = document.createElement('li');
    item.className = 'list-group-item d-flex justify-content-between';
    item.innerHTML = `<span>${k}</span><strong>${v}</strong>`;
    countList.appendChild(item);
  });
}

function syncDuration() {
  const base = startAt || serverCameraStartedAt;
  if (!base) {
    document.getElementById('todayDuration').textContent = '00:00:00';
    return;
  }
  document.getElementById('todayDuration').textContent = formatDuration(Date.now() - base);
}

async function refreshSystem() {
  const data = await fetch('/api/system/status').then((r) => r.json());
  const isOnline = data.camera_on && data.camera_state !== '未连接';
  document.getElementById('cameraStateMini').textContent = isOnline ? '在线' : '离线';

  if (data.camera_started_at) {
    serverCameraStartedAt = new Date(data.camera_started_at.replace(' ', 'T')).getTime();
  }
  if (!data.camera_on) {
    startAt = null;
    serverCameraStartedAt = null;
  }

  statusText.textContent = `状态：${data.detection_on ? '运行中' : (data.camera_on ? '摄像头已开启' : '待机')}`;
  cameraMeta.textContent = `类型：${data.camera_type || '-'} | 分辨率：${data.openmv_settings?.resolution || '-'} | 帧率：${data.openmv_settings?.fps || '-'}fps`;
  perfMeta.textContent = `推理耗时：${data.last_inference_ms || '-'}ms`;
  const cfg = data.openmv_settings || {};
  document.getElementById('cfgMeta1').textContent = `波特率：${cfg.baudrate || '-'} | 曝光：${cfg.exposure || '-'} | 增益：${cfg.gain || '-'}`;
  document.getElementById('cfgMeta2').textContent = `超时：${cfg.serial_timeout || '-'}ms | 自动白平衡：${cfg.auto_white_balance ? '开' : '关'} | 镜像：${cfg.flip_horizontal ? 'H' : '-'}${cfg.flip_vertical ? 'V' : '-'}`;

  if (data.camera_type === 'openmv') {
    openmvPanel.classList.remove('d-none');
  }
  syncDuration();
}

async function pollDetection() {
  const data = await fetch('/api/detection/frame-data').then((r) => r.json());
  if (!data.ok) {
    statusText.textContent = `状态：${data.message || '错误'}`;
    return;
  }
  drawBoxes(data.boxes);
  renderCounts(data.counts);

  const stat = await fetch('/api/stats/live').then((r) => r.json());
  const cards = stat.cards;
  const running = cards.camera_on && data.detection_on;
  statusText.textContent = `状态：${running ? '运行中' : '待机'}`;
  cameraMeta.textContent = `类型：${cards.camera_type || '-'} | 分辨率：${cards.resolution || '-'} | 帧率：${cards.fps || '-'}fps`;
  perfMeta.textContent = `推理耗时：${cards.inference_ms}ms`;
  document.getElementById('onlineUsers').textContent = cards.active_users;

  const cfg = stat.cards.openmv_settings || {};
  document.getElementById('cfgMeta1').textContent = `波特率：${cfg.baudrate || '-'} | 曝光：${cfg.exposure || '-'} | 增益：${cfg.gain || '-'}`;
  document.getElementById('cfgMeta2').textContent = `超时：${cfg.serial_timeout || '-'}ms | 自动白平衡：${cfg.auto_white_balance ? '开' : '关'} | 镜像：${cfg.flip_horizontal ? 'H' : '-'}${cfg.flip_vertical ? 'V' : '-'}`;
}

async function pollOpenmvFrames() {
  const data = await fetch('/api/openmv/frame').then((r) => r.json()).catch(() => ({ ok: false }));
  if (!data.ok) {
    openmvConnStatus.textContent = `连接状态：未收到视频帧（${data.message || '等待中'}）`;
    return;
  }
  openmvImage.src = `data:image/jpeg;base64,${data.frame}`;
  const target = document.getElementById('openmvTarget').value.trim() || '-';
  openmvConnStatus.textContent = `连接状态：已连接 | 视频端口：${target} | RX=${data.len}`;
}

cameraType.onchange = () => {
  openmvPanel.classList.toggle('d-none', cameraType.value !== 'openmv');
};

document.getElementById('scanPortBtn').onclick = async () => {
  const data = await fetch('/api/openmv/ports').then((r) => r.json());
  if (!data.ok || !data.ports.length) {
    showToast('未检测到可用串口，请手动输入。', 'warning');
    return;
  }
  document.getElementById('openmvTarget').value = data.ports[0];
  showToast(`已扫描到 ${data.ports.length} 个串口`, 'info');
};

document.getElementById('connectOpenmvBtn').onclick = async () => {
  const mode = document.getElementById('openmvMode').value;
  const target = document.getElementById('openmvTarget').value.trim();
  const baudrate = Number(document.getElementById('baudrate').value || 115200);
  await postApi('/api/openmv/settings', { baudrate });
  const data = await postApi('/api/openmv/connect', { mode, target });
  if (!data.ok) {
    openmvConnStatus.textContent = `连接状态：失败（${data.message || '未知错误'}）`;
    showToast(data.message || 'OpenMV 连接失败', 'danger');
    return;
  }
  cameraType.value = 'openmv';
  openmvPanel.classList.remove('d-none');
  openmvConnStatus.textContent = `连接状态：连接中 (${mode} ${target})`;
  showToast('OpenMV 连接成功');
};

document.getElementById('disconnectOpenmvBtn').onclick = async () => {
  await postApi('/api/openmv/disconnect');
  openmvConnStatus.textContent = '连接状态：未连接 | 视频端口：--';
  showToast('OpenMV 已断开', 'secondary');
};

document.getElementById('openCameraBtn').onclick = async () => {
  try {
    if (cameraType.value === 'local') {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      video.classList.remove('d-none');
      openmvImage.classList.add('d-none');
    } else {
      video.classList.add('d-none');
      openmvImage.classList.remove('d-none');
      if (frameTimer) clearInterval(frameTimer);
      frameTimer = setInterval(pollOpenmvFrames, 500);
      pollOpenmvFrames();
    }
    const resp = await postApi('/api/camera/start', { camera_type: cameraType.value });
    if (!resp.ok) {
      showToast(resp.message || '摄像头开启失败', 'warning');
      return;
    }
    if (!startAt) startAt = Date.now();
    serverCameraStartedAt = startAt;
    if (durationTimer) clearInterval(durationTimer);
    durationTimer = setInterval(syncDuration, 1000);
    syncDuration();
    showToast('摄像头已开启');
  } catch (e) {
    statusText.textContent = '状态：无法访问摄像头（请检查浏览器权限）';
  }
};

document.getElementById('closeCameraBtn').onclick = async () => {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (timer) clearInterval(timer);
  if (frameTimer) clearInterval(frameTimer);
  if (durationTimer) clearInterval(durationTimer);
  timer = null;
  frameTimer = null;
  durationTimer = null;
  await postApi('/api/camera/stop');
  startAt = null;
  serverCameraStartedAt = null;
  syncDuration();
  drawBoxes([]);
  renderCounts({});
  statusText.textContent = '状态：待机';
  showToast('摄像头已关闭', 'secondary');
};

document.getElementById('startDetBtn').onclick = async () => {
  const data = await postApi('/api/detection/start');
  if (!data.ok) {
    statusText.textContent = `状态：${data.message}`;
    showToast(`检测开启失败：${data.message}`, 'warning');
    return;
  }
  if (timer) clearInterval(timer);
  timer = setInterval(pollDetection, 1200);
  statusText.textContent = '状态：运行中';
};

document.getElementById('stopDetBtn').onclick = async () => {
  await postApi('/api/detection/stop');
  if (timer) clearInterval(timer);
  timer = null;
  drawBoxes([]);
  statusText.textContent = '状态：待机';
};

document.getElementById('fullscreenBtn').onclick = async () => {
  const wrap = document.getElementById('videoWrap');
  const btn = document.getElementById('fullscreenBtn');
  if (!document.fullscreenElement) {
    await wrap.requestFullscreen();
    btn.textContent = '📥';
  } else {
    await document.exitFullscreen();
    btn.textContent = '📤';
  }
};

if (durationTimer) clearInterval(durationTimer);
durationTimer = setInterval(syncDuration, 1000);
setInterval(refreshSystem, 2500);
refreshSystem();
syncDuration();

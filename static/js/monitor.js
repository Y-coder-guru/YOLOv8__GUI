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
let lastFrameAt = 0;
let startAt = null;

async function postApi(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : null,
  });
  return res.json();
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

async function refreshSystem() {
  const res = await fetch('/api/system/status');
  const data = await res.json();
  document.getElementById('cameraStateMini').textContent = data.camera_state;
}

async function pollDetection() {
  const res = await fetch('/api/detection/frame-data');
  const data = await res.json();
  if (!data.ok) {
    statusText.textContent = `状态：${data.message || '错误'}`;
    return;
  }
  drawBoxes(data.boxes);
  renderCounts(data.counts);
  statusText.textContent = `状态：${data.detection_on ? '检测中' : '摄像头已开启'}`;

  const stat = await fetch('/api/stats/live').then((r) => r.json());
  cameraMeta.textContent = `类型: ${stat.cards.camera_type || '-'} | 分辨率: ${stat.cards.resolution || '-'} | 帧率: ${stat.cards.fps || '-'}fps`;
  perfMeta.textContent = `推理耗时: ${stat.cards.inference_ms}ms | 今日总目标: ${stat.cards.today_total_detected}`;
  document.getElementById('onlineUsers').textContent = stat.cards.active_users;
  if (startAt) {
    const mins = Math.floor((Date.now() - startAt) / 60000);
    document.getElementById('todayDuration').textContent = `${mins} min`;
  }
}

async function pollOpenmvFrames() {
  const data = await fetch('/api/openmv/frame').then((r) => r.json()).catch(() => ({ ok: false }));
  if (!data.ok) return;
  lastFrameAt = Date.now();
  openmvImage.src = `data:image/jpeg;base64,${data.frame}`;
  openmvConnStatus.textContent = `连接状态：已连接 | RX=${data.len} | 帧头=${data.header} 帧尾=${data.footer}`;
}

cameraType.onchange = () => {
  openmvPanel.classList.toggle('d-none', cameraType.value !== 'openmv');
};

document.getElementById('scanPortBtn').onclick = async () => {
  const res = await fetch('/api/openmv/ports');
  const data = await res.json();
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
  const data = await postApi('/api/openmv/connect', { mode, target });
  await postApi('/api/openmv/settings', { baudrate });
  if (!data.ok) {
    openmvConnStatus.textContent = `连接状态：失败（${data.message || '未知错误'}）`;
    showToast('OpenMV 连接失败，请检查串口占用/网络连通性。', 'danger');
    return;
  }
  openmvConnStatus.textContent = `连接状态：连接中 (${mode} ${target}) 波特率=${baudrate}`;
  showToast('OpenMV 连接成功');
};

document.getElementById('disconnectOpenmvBtn').onclick = async () => {
  await postApi('/api/openmv/disconnect');
  openmvConnStatus.textContent = '连接状态：未连接';
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
      lastFrameAt = Date.now();
      setTimeout(async () => {
        if (Date.now() - lastFrameAt >= 5000) {
          await postApi('/api/openmv/disconnect');
          await postApi('/api/camera/stop');
          showToast('5 秒未收到图像，已自动断开。请检查波特率/USB 线/OpenMV 固件。', 'warning');
        }
      }, 5200);
    }
    const resp = await postApi('/api/camera/start', { camera_type: cameraType.value });
    if (!resp.ok) {
      statusText.textContent = `状态：${resp.message || '失败'}`;
      showToast(resp.message || '摄像头开启失败', 'warning');
      return;
    }
    startAt = Date.now();
    statusText.textContent = `状态：${cameraType.value === 'local' ? '本地摄像头已开启' : 'OpenMV 摄像头已开启'}`;
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
  timer = null;
  frameTimer = null;
  await postApi('/api/camera/stop');
  drawBoxes([]);
  renderCounts({});
  statusText.textContent = '状态：摄像头已关闭';
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
  statusText.textContent = '状态：检测中';
};

document.getElementById('stopDetBtn').onclick = async () => {
  await postApi('/api/detection/stop');
  if (timer) clearInterval(timer);
  timer = null;
  drawBoxes([]);
  statusText.textContent = '状态：检测已停止';
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

setInterval(refreshSystem, 2500);

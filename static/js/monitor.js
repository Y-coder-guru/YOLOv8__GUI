const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const countList = document.getElementById('countList');
const statusText = document.getElementById('statusText');
let stream = null;
let timer = null;

async function postApi(url) {
  const res = await fetch(url, { method: 'POST' });
  return res.json();
}

function drawBoxes(boxes = []) {
  overlay.width = video.clientWidth;
  overlay.height = video.clientHeight;
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
}

document.getElementById('openCameraBtn').onclick = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await postApi('/api/camera/start');
    statusText.textContent = '状态：摄像头已开启';
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
  timer = null;
  await postApi('/api/camera/stop');
  drawBoxes([]);
  renderCounts({});
  statusText.textContent = '状态：摄像头已关闭';
};

document.getElementById('startDetBtn').onclick = async () => {
  const data = await postApi('/api/detection/start');
  if (!data.ok) {
    statusText.textContent = `状态：${data.message}`;
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
  if (!document.fullscreenElement) {
    await wrap.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
};

window.addEventListener('beforeunload', async () => {
  if (timer) clearInterval(timer);
});

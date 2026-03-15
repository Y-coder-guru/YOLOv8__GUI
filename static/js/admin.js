const userList = document.getElementById('userList');
const logList = document.getElementById('logList');

async function refreshAdmin() {
  const res = await fetch('/api/admin/overview');
  const data = await res.json();
  if (!data.ok) return;

  animateNumber(document.getElementById('mUser'), data.metrics.user_count);
  animateNumber(document.getElementById('mHistory'), data.metrics.history_total);
  document.getElementById('mCamera').textContent = data.metrics.camera_on ? '开启' : '关闭';
  animateNumber(document.getElementById('mLogs'), data.metrics.today_logs);

  userList.innerHTML = '';
  data.users.forEach((u) => {
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.textContent = `${u.username} (${u.is_admin ? '管理员' : '普通用户'}) - ${u.created_at}`;
    userList.appendChild(li);
  });

  logList.innerHTML = '';
  data.logs.forEach((l) => {
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.textContent = `[${l.time}] [${l.type}] ${l.content}`;
    logList.appendChild(li);
  });
}

document.getElementById('saveOpenmvCfg').onclick = async () => {
  const payload = {
    resolution: document.getElementById('cfgRes').value,
    fps: Number(document.getElementById('cfgFps').value || 15),
    flip_horizontal: document.getElementById('cfgFlipH').checked,
    flip_vertical: document.getElementById('cfgFlipV').checked,
  };
  const res = await fetch('/api/openmv/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.ok) {
    showToast('OpenMV 配置已保存');
  } else {
    showToast('配置保存失败，请检查参数是否正确。', 'danger');
  }
};

document.getElementById('deleteBtn').onclick = async () => {
  const id = document.getElementById('deleteId').value.trim();
  if (!id) return;
  const res = await fetch(`/api/admin/history/${id}`, { method: 'DELETE' });
  if (res.ok) {
    document.getElementById('deleteId').value = '';
    showToast('删除成功');
  } else {
    showToast('删除失败：请确认 ID 存在。', 'danger');
  }
  refreshAdmin();
};

refreshAdmin();
setInterval(refreshAdmin, 3000);

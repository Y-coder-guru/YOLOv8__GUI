const userList = document.getElementById('userList');
const logList = document.getElementById('logList');
let logOffset = 0;
let loading = false;

async function refreshAdmin(resetLogs = true) {
  const operator = document.getElementById('logOperator').value.trim();
  if (resetLogs) {
    logOffset = 0;
    logList.innerHTML = '';
  }
  const res = await fetch(`/api/admin/overview?offset=${logOffset}&limit=50&operator=${encodeURIComponent(operator)}`);
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
    li.innerHTML = `<div><b>${u.username}</b> (${u.is_admin ? '管理员' : '普通用户'}) / ${u.status}</div><div class='small text-muted'>注册: ${u.created_at} | 最后登录: ${u.last_login_at}</div><div class='mt-1 d-flex gap-1'><button class='btn btn-sm btn-outline-warning'>重置密码</button><button class='btn btn-sm btn-outline-info'>切换角色</button><button class='btn btn-sm btn-outline-danger'>启停账号</button></div>`;
    const [pwdBtn, roleBtn, statusBtn] = li.querySelectorAll('button');
    pwdBtn.onclick = async () => { await fetch(`/api/admin/user/${u.id}/reset-password`, { method: 'POST' }); showToast('密码已重置为 12345678'); };
    roleBtn.onclick = async () => { await fetch(`/api/admin/user/${u.id}/role`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_admin: !u.is_admin }) }); refreshAdmin(); };
    statusBtn.onclick = async () => { await fetch(`/api/admin/user/${u.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: u.status !== '启用' }) }); refreshAdmin(); };
    userList.appendChild(li);
  });

  data.logs.forEach((l) => {
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.textContent = `[${l.time}] ${l.operator} ${l.ip} ${l.content} (${l.result})`;
    logList.appendChild(li);
  });
  logOffset += data.logs.length;
}

document.getElementById('saveOpenmvCfg').onclick = async () => {
  const payload = {
    resolution: document.getElementById('cfgRes').value,
    fps: Number(document.getElementById('cfgFps').value || 15),
    baudrate: Number(document.getElementById('cfgBaud').value || 115200),
    flip_horizontal: document.getElementById('cfgFlipH').checked,
    flip_vertical: document.getElementById('cfgFlipV').checked,
  };
  const res = await fetch('/api/openmv/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.ok) showToast('摄像头配置已保存并实时生效');
};

document.getElementById('logOperator').oninput = () => refreshAdmin(true);
logList.addEventListener('scroll', async () => {
  if (loading) return;
  if (logList.scrollTop + logList.clientHeight >= logList.scrollHeight - 6) {
    loading = true;
    await refreshAdmin(false);
    loading = false;
  }
});

refreshAdmin(true);
setInterval(() => refreshAdmin(true), 5000);

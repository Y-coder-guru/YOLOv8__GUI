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
  document.getElementById('mHistoryDesc').textContent = data.metrics.history_total_desc;
  document.getElementById('mCamera').textContent = data.metrics.camera_on ? '开启' : '关闭';
  animateNumber(document.getElementById('mLogs'), data.metrics.today_logs);

  userList.innerHTML = '';
  data.users.forEach((u) => {
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.innerHTML = `<div><b>${u.username}</b> (${u.is_admin ? '管理员' : '普通用户'}) / ${u.status}</div>
      <div class='small text-muted'>邮箱: ${u.email || '-'} | 电话: ${u.phone || '-'} | 注册: ${u.created_at}</div>
      <div class='mt-1 d-flex gap-1 flex-wrap'>
        <button class='btn btn-sm btn-outline-warning'>重置密码</button>
        <button class='btn btn-sm btn-outline-info'>编辑</button>
        <button class='btn btn-sm btn-outline-danger'>删除</button>
      </div>`;
    const [pwdBtn, editBtn, delBtn] = li.querySelectorAll('button');
    pwdBtn.onclick = async () => {
      const p = prompt(`请输入 ${u.username} 的新密码（至少6位）`, '12345678');
      if (!p) return;
      const r = await fetch(`/api/admin/users/${u.id}/password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: p }) });
      showToast(r.ok ? '密码修改成功' : '密码修改失败', r.ok ? 'success' : 'danger');
    };
    editBtn.onclick = async () => {
      const username = prompt('用户名', u.username);
      if (!username) return;
      const email = prompt('邮箱', u.email || '');
      const phone = prompt('电话', u.phone || '');
      const isAdmin = confirm('是否设为管理员？') ? true : false;
      const isActive = !confirm('是否禁用该账号？（选择“取消”保持启用）');
      const r = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, phone, is_admin: isAdmin, is_active: isActive, avatar_url: u.avatar_url || '' }),
      });
      showToast(r.ok ? '用户更新成功' : '用户更新失败', r.ok ? 'success' : 'danger');
      refreshAdmin(true);
    };
    delBtn.onclick = async () => {
      if (!confirm(`确认删除用户 ${u.username}？`)) return;
      const r = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      const d = await r.json();
      showToast(r.ok ? '用户已删除' : (d.message || '删除失败'), r.ok ? 'warning' : 'danger');
      refreshAdmin(true);
    };
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

document.getElementById('openCreateUser').onclick = async () => {
  const username = prompt('新用户名');
  if (!username) return;
  const password = prompt('初始密码（至少6位）', '12345678');
  if (!password) return;
  const email = prompt('邮箱', '');
  const phone = prompt('电话', '');
  const is_admin = confirm('是否设为管理员？');
  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, email, phone, is_admin }),
  });
  const data = await res.json();
  showToast(res.ok ? '用户创建成功' : (data.message || '创建失败'), res.ok ? 'success' : 'danger');
  refreshAdmin(true);
};

document.getElementById('saveOpenmvCfg').onclick = async () => {
  const payload = {
    resolution: document.getElementById('cfgRes').value,
    fps: Number(document.getElementById('cfgFps').value || 15),
    baudrate: Number(document.getElementById('cfgBaud').value || 115200),
    exposure: Number(document.getElementById('cfgExposure').value || 50),
    gain: Number(document.getElementById('cfgGain').value || 1.0),
    serial_timeout: Number(document.getElementById('cfgTimeout').value || 800),
    auto_white_balance: document.getElementById('cfgAwb').checked,
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

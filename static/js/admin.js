const userList = document.getElementById('userList');
const logList = document.getElementById('logList');
let logOffset = 0;
const logPageSize = 20;

async function refreshAdmin() {
  const operator = document.getElementById('logOperator').value.trim();
  const res = await fetch(`/api/admin/overview?offset=${logOffset}&limit=${logPageSize}&operator=${encodeURIComponent(operator)}`);
  const data = await res.json();
  if (!data.ok) return;

  animateNumber(document.getElementById('mUser'), data.metrics.user_count);
  animateNumber(document.getElementById('mHistory'), data.metrics.history_total);
  document.getElementById('mHistoryDesc').textContent = data.metrics.history_total_desc;
  document.getElementById('mCamera').textContent = data.metrics.camera_on ? '在线' : '离线';
  animateNumber(document.getElementById('mLogs'), data.metrics.today_logs);

  userList.innerHTML = '';
  data.users.forEach((u) => {
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.innerHTML = `<div><b>${u.username}</b> (${u.is_admin ? '管理员' : '普通用户'}) / ${u.status}</div>
      <div class='small text-muted'>邮箱: ${u.email || '-'} | 电话: ${u.phone || '-'} | 注册: ${u.created_at}</div>
      <div class='mt-1 d-flex gap-1 flex-wrap'>
        <button class='btn btn-sm btn-outline-secondary'>查看</button>
        <button class='btn btn-sm btn-outline-warning'>修改密码</button>
        <button class='btn btn-sm btn-outline-info'>编辑</button>
        <button class='btn btn-sm btn-outline-danger'>删除</button>
      </div>`;
    const [viewBtn, pwdBtn, editBtn, delBtn] = li.querySelectorAll('button');
    viewBtn.onclick = () => {
      alert(`用户：${u.username}\n角色：${u.is_admin ? '管理员' : '普通用户'}\n状态：${u.status}\n邮箱：${u.email || '-'}\n电话：${u.phone || '-'}\n注册时间：${u.created_at}\n最近登录：${u.last_login_at || '-'}`);
    };
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
      refreshAdmin();
    };
    delBtn.onclick = async () => {
      if (!confirm(`确认删除用户 ${u.username}？`)) return;
      const r = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      const d = await r.json();
      showToast(r.ok ? '用户已删除' : (d.message || '删除失败'), r.ok ? 'warning' : 'danger');
      refreshAdmin();
    };
    userList.appendChild(li);
  });

  logList.innerHTML = '';
  data.logs.forEach((l) => {
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.textContent = `[${l.time}] ${l.operator} ${l.ip} ${l.content} (${l.result})`;
    logList.appendChild(li);
  });

  document.getElementById('prevLogPage').disabled = logOffset <= 0;
  document.getElementById('nextLogPage').disabled = data.logs.length < logPageSize;
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
  refreshAdmin();
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

document.getElementById('logOperator').oninput = () => {
  logOffset = 0;
  refreshAdmin();
};
document.getElementById('prevLogPage').onclick = () => {
  logOffset = Math.max(0, logOffset - logPageSize);
  refreshAdmin();
};
document.getElementById('nextLogPage').onclick = () => {
  logOffset += logPageSize;
  refreshAdmin();
};

refreshAdmin();
setInterval(() => refreshAdmin(), 5000);

async function loadMe() {
  const data = await fetch('/api/account/me').then((r) => r.json());
  if (!data.ok) return;
  const u = data.user;
  document.getElementById('pfUsername').value = u.username || '';
  document.getElementById('pfEmail').value = u.email || '';
  document.getElementById('pfPhone').value = u.phone || '';
  document.getElementById('pfAvatar').value = u.avatar_url || '';
  document.getElementById('pfCreated').value = u.created_at || '';
}

document.getElementById('saveProfileBtn').onclick = async () => {
  const payload = {
    username: document.getElementById('pfUsername').value.trim(),
    email: document.getElementById('pfEmail').value.trim(),
    phone: document.getElementById('pfPhone').value.trim(),
    avatar_url: document.getElementById('pfAvatar').value.trim(),
  };
  const res = await fetch('/api/account/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  showToast(res.ok ? '个人信息已更新' : (data.message || '更新失败'), res.ok ? 'success' : 'danger');
};

document.getElementById('changePwdBtn').onclick = async () => {
  const old_password = prompt('请输入旧密码');
  if (!old_password) return;
  const new_password = prompt('请输入新密码（至少6位）');
  if (!new_password) return;
  const res = await fetch('/api/account/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ old_password, new_password }),
  });
  const data = await res.json();
  showToast(res.ok ? '密码修改成功' : (data.message || '密码修改失败'), res.ok ? 'success' : 'danger');
};

loadMe();

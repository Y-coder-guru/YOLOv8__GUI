const userList = document.getElementById('userList');
const logList = document.getElementById('logList');

async function refreshAdmin() {
  const res = await fetch('/api/admin/overview');
  const data = await res.json();
  if (!data.ok) return;

  document.getElementById('mUser').textContent = data.metrics.user_count;
  document.getElementById('mHistory').textContent = data.metrics.history_total;
  document.getElementById('mCamera').textContent = data.metrics.camera_on ? '开启' : '关闭';
  document.getElementById('mLogs').textContent = data.metrics.today_logs;

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

document.getElementById('deleteBtn').onclick = async () => {
  const id = document.getElementById('deleteId').value.trim();
  if (!id) return;
  const res = await fetch(`/api/admin/history/${id}`, { method: 'DELETE' });
  if (res.ok) {
    document.getElementById('deleteId').value = '';
  }
  refreshAdmin();
};

refreshAdmin();
setInterval(refreshAdmin, 3000);

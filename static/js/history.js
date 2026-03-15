const tbody = document.querySelector('#historyTable tbody');
const pageInfo = document.getElementById('pageInfo');
let page = 1;
const pageSize = 20;
let lastTotal = 0;

function getFilters() {
  return {
    keyword: document.getElementById('keyword').value.trim(),
    category: document.getElementById('category').value.trim(),
    status: document.getElementById('status').value.trim(),
    start_time: document.getElementById('startTime').value,
    end_time: document.getElementById('endTime').value,
    page,
    page_size: pageSize,
  };
}

async function showDetail(id) {
  const modal = new bootstrap.Modal(document.getElementById('detailModal'));
  const body = document.getElementById('detailBody');
  body.innerHTML = '加载中...';
  modal.show();
  const data = await fetch(`/api/history/${id}`).then((r) => r.json());
  if (!data.ok) {
    body.innerHTML = '<div class="text-danger">加载失败</div>';
    return;
  }
  const r = data.record;
  body.innerHTML = `<div class="row"><div class="col-md-6"><div class="fake-shot">检测画面占位</div></div><div class="col-md-6"><p><b>时间:</b> ${r.time}</p><p><b>类别:</b> ${r.category}</p><p><b>数量:</b> ${r.count}</p><p><b>操作人:</b> ${r.operator}</p><p><b>操作类型:</b> ${r.operation_type}</p><p><b>完整数据:</b> confidence=${r.confidence}</p></div></div>`;
}

async function loadHistory() {
  const params = new URLSearchParams(getFilters());
  const res = await fetch(`/api/history?${params.toString()}`);
  const data = await res.json();
  if (!data.ok) return;

  lastTotal = data.total;
  page = data.page;
  tbody.innerHTML = '';
  if (!data.records.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">暂无数据</td></tr>';
  }

  data.records.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.id}</td><td>${r.time}</td><td>${r.category}</td><td>${r.count}</td><td>${r.operator}</td><td>${r.operation_type}</td><td><button class="btn btn-sm btn-outline-primary">详情</button></td>`;
    tr.querySelector('button').onclick = () => showDetail(r.id);
    tbody.appendChild(tr);
  });

  const totalPage = Math.max(1, Math.ceil(lastTotal / pageSize));
  pageInfo.textContent = `共 ${lastTotal} 条，当前第 ${page}/${totalPage} 页`;
}

document.getElementById('searchBtn').onclick = () => { page = 1; loadHistory(); };
document.getElementById('resetBtn').onclick = () => {
  ['keyword', 'category', 'status', 'startTime', 'endTime'].forEach((id) => (document.getElementById(id).value = ''));
  page = 1;
  loadHistory();
};
document.getElementById('prevPage').onclick = () => { if (page > 1) { page -= 1; loadHistory(); } };
document.getElementById('nextPage').onclick = () => { const totalPage = Math.max(1, Math.ceil(lastTotal / pageSize)); if (page < totalPage) { page += 1; loadHistory(); } };

loadHistory();

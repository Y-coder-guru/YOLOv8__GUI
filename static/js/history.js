const tbody = document.querySelector('#historyTable tbody');
const pageInfo = document.getElementById('pageInfo');
let page = 1;
const pageSize = 20;
let lastTotal = 0;

function getFilters() {
  return {
    keyword: document.getElementById('keyword').value.trim(),
    category: document.getElementById('category').value.trim(),
    start_time: document.getElementById('startTime').value,
    end_time: document.getElementById('endTime').value,
    page,
    page_size: pageSize,
  };
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
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">暂无数据</td></tr>';
  }

  data.records.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.id}</td><td>${r.time}</td><td>${r.category}</td><td>${r.count}</td><td>${r.confidence}</td>`;
    tbody.appendChild(tr);
  });

  const totalPage = Math.max(1, Math.ceil(lastTotal / pageSize));
  pageInfo.textContent = `共 ${lastTotal} 条，当前第 ${page}/${totalPage} 页`;
}

document.getElementById('searchBtn').onclick = () => {
  page = 1;
  loadHistory();
};

document.getElementById('resetBtn').onclick = () => {
  ['keyword', 'category', 'startTime', 'endTime'].forEach((id) => (document.getElementById(id).value = ''));
  page = 1;
  loadHistory();
};

document.getElementById('prevPage').onclick = () => {
  if (page <= 1) return;
  page -= 1;
  loadHistory();
};

document.getElementById('nextPage').onclick = () => {
  const totalPage = Math.max(1, Math.ceil(lastTotal / pageSize));
  if (page >= totalPage) return;
  page += 1;
  loadHistory();
};

loadHistory();

const rawTbody = document.querySelector('#rawTable tbody');
const rawSummary = document.getElementById('rawSummary');
const rawJson = document.getElementById('rawJson');

async function loadRawData() {
  const page = Math.max(1, Number(document.getElementById('rawPage').value || 1));
  const pageSize = Math.min(100, Math.max(1, Number(document.getElementById('rawPageSize').value || 20)));
  const params = new URLSearchParams({ page, page_size: pageSize });
  const res = await fetch(`/api/history?${params.toString()}`);
  const data = await res.json();
  if (!data.ok) {
    showToast(data.message || '加载失败', 'danger');
    return;
  }

  rawTbody.innerHTML = '';
  if (!data.records.length) {
    rawTbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">暂无数据</td></tr>';
  }

  data.records.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.id}</td><td>${r.time}</td><td>${r.category}</td><td>${r.count}</td><td>${r.confidence}</td><td>${r.operator}</td><td>${r.operation_type}</td>`;
    rawTbody.appendChild(tr);
  });

  rawSummary.textContent = `共 ${data.total} 条，当前第 ${data.page} 页，每页 ${data.page_size} 条`;
  rawJson.textContent = JSON.stringify(data.records, null, 2);
}

document.getElementById('rawRefreshBtn').onclick = loadRawData;
document.getElementById('rawCopyBtn').onclick = async () => {
  try {
    await navigator.clipboard.writeText(rawJson.textContent);
    showToast('JSON 已复制');
  } catch {
    showToast('复制失败，请手动复制', 'warning');
  }
};

document.getElementById('rawPage').onchange = loadRawData;
document.getElementById('rawPageSize').onchange = loadRawData;

loadRawData();

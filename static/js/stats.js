const lineChart = echarts.init(document.getElementById('lineChart'));
const pieChart = echarts.init(document.getElementById('pieChart'));
const barChart = echarts.init(document.getElementById('barChart'));
let allCategories = [];

async function refreshCameraStatusCard() {
  const el = document.getElementById('cardCamera');
  if (!el) return;
  try {
    const res = await fetch('/api/camera/status');
    const data = await res.json();
    const phase = data.phase || (data.connected ? 'running' : 'offline');
    el.textContent = data.text || (phase === 'running' ? '已连接' : '离线');
    el.classList.toggle('status-online', phase === 'running');
    el.classList.toggle('status-ready', phase === 'ready');
    el.classList.toggle('status-offline', phase === 'offline');
  } catch (e) {
    el.textContent = '离线';
    el.classList.remove('status-online');
    el.classList.remove('status-ready');

    el.classList.add('status-offline');
  }
}

function selectedCategory() {
  return document.getElementById('categoryFilter').value;
}

function togglePlaceholder(id, show, chartId) {
  document.getElementById(id).classList.toggle('d-none', !show);
  document.getElementById(chartId).style.display = show ? 'none' : 'block';
}

function getRangePayload() {
  return {
    range: document.getElementById('rangeType').value,
    start_time: document.getElementById('startTime').value.replace('T', ' '),
    end_time: document.getElementById('endTime').value.replace('T', ' '),
    categories: selectedCategory(),
  };
}

function applyLine(timeline = []) {
  if (!timeline.length) {
    togglePlaceholder('linePlaceholder', true, 'lineChart');
    return;
  }
  togglePlaceholder('linePlaceholder', false, 'lineChart');
  lineChart.setOption({
    tooltip: { trigger: 'axis' },
    dataZoom: [{ type: 'inside' }, { type: 'slider' }],
    xAxis: { type: 'category', data: timeline.map((x) => x.time) },
    yAxis: { type: 'value' },
    series: [{
      name: '数量', type: 'line', smooth: true,
      data: timeline.map((x) => x.value),
      symbolSize: 7,
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(79,70,229,0.45)' },
          { offset: 1, color: 'rgba(79,70,229,0.05)' },
        ]),
      },
      lineStyle: { width: 3, color: '#4f46e5' },
    }],
  });
}

function applyPie(pie = []) {
  if (!pie.length) {
    togglePlaceholder('piePlaceholder', true, 'pieChart');
    return;
  }
  togglePlaceholder('piePlaceholder', false, 'pieChart');
  pieChart.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [{
      type: 'pie',
      radius: ['38%', '70%'],
      data: pie,
      label: { formatter: '{b}: {d}%' },
    }],
  });
}

function applyBars(bar = []) {
  if (!bar.length) {
    togglePlaceholder('barPlaceholder', true, 'barChart');
    return;
  }
  togglePlaceholder('barPlaceholder', false, 'barChart');
  const sorted = [...bar].sort((a, b) => b.value - a.value);
  barChart.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: sorted.map((x) => x.name) },
    yAxis: { type: 'value' },
    series: [{
      type: 'bar',
      data: sorted.map((x) => x.value),
      label: { show: true, position: 'top' },
      itemStyle: { color: '#36a2eb', borderRadius: [8, 8, 0, 0] },
    }],
  });
}

async function refreshCards() {
  const res = await fetch('/api/stats/live');
  const data = await res.json();
  if (!data.ok) return;
  animateNumber(document.getElementById('cardEvents'), data.cards.today_events);
  animateNumber(document.getElementById('cardObjects'), data.cards.today_objects);
  animateNumber(document.getElementById('cardUsers'), data.cards.active_users);
}

async function refreshAdvanced() {
  const q = new URLSearchParams(getRangePayload()).toString();
  const res = await fetch(`/api/stats/advanced?${q}`);
  const data = await res.json();
  if (!data.ok) {
    showToast(`数据加载失败：${data.message || '未知错误'}`, 'danger');
    return;
  }

  const cate = document.getElementById('categoryFilter');
  if (!allCategories.length) {
    allCategories = data.categories;
    cate.innerHTML = '<option value="">全部类别</option>' + allCategories.map((x) => `<option value="${x}">${x}</option>`).join('');
  }

  applyLine(data.timeline || []);
  applyPie(data.pie || []);
  applyBars(data.bar || []);
}

document.getElementById('refreshBtn').onclick = async () => {
  await refreshCards();
  await refreshCameraStatusCard();
  await refreshAdvanced();
  showToast('数据已刷新');
};

document.getElementById('categoryFilter').onchange = refreshAdvanced;
document.getElementById('rangeType').onchange = refreshAdvanced;
document.getElementById('startTime').onchange = refreshAdvanced;
document.getElementById('endTime').onchange = refreshAdvanced;

document.getElementById('clearDataBtn').onclick = async () => {
  const res = await fetch('/api/admin/history', { method: 'DELETE' });
  if (res.ok) {
    showToast('数据已清空', 'warning');
    refreshAdvanced();
    refreshCards();
  } else {
    showToast('仅管理员可以清空数据', 'danger');
  }
};

async function init() {
  await refreshCards();
  await refreshCameraStatusCard();
  await refreshAdvanced();
  setInterval(() => {
    refreshCards();
    refreshAdvanced();
  }, 5000);
  setInterval(refreshCameraStatusCard, 3000);

  setTimeout(() => {
    lineChart.resize();
    pieChart.resize();
    barChart.resize();
  }, 200);
}

init();
window.addEventListener('resize', () => {
  lineChart.resize();
  pieChart.resize();
  barChart.resize();
});

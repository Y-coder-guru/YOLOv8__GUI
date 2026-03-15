const lineChart = echarts.init(document.getElementById('lineChart'));
const pieChart = echarts.init(document.getElementById('pieChart'));
const barChart = echarts.init(document.getElementById('barChart'));
let allCategories = [];

function selectedCategory() {
  return document.getElementById('categoryFilter').value;
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
  lineChart.setOption({
    tooltip: { trigger: 'axis' },
    dataZoom: [{ type: 'inside' }, { type: 'slider' }],
    xAxis: { type: 'category', data: timeline.map((x) => x.time) },
    yAxis: { type: 'value' },
    series: [{
      name: '数量', type: 'line', smooth: true,
      data: timeline.map((x) => x.value),
      symbolSize: 8,
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(31,119,255,0.45)' },
          { offset: 1, color: 'rgba(31,119,255,0.05)' },
        ]),
      },
      lineStyle: { width: 3, color: '#1f77ff' },
    }],
  });
}

function applyCategoryBars(pie = []) {
  const sorted = [...pie].sort((a, b) => b.value - a.value);
  pieChart.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: sorted.map((x) => x.name) },
    series: [{
      type: 'bar',
      data: sorted.map((x) => x.value),
      label: { show: true, position: 'right' },
      itemStyle: { color: '#36a2eb', borderRadius: [0, 8, 8, 0] },
    }],
  });
}

function applyRadar(bar = []) {
  const maxVal = Math.max(5, ...bar.map((x) => x.value));
  barChart.setOption({
    tooltip: {},
    radar: {
      indicator: bar.map((x) => ({ name: x.name, max: maxVal })),
      radius: '70%',
    },
    series: [{
      type: 'radar',
      data: [{ value: bar.map((x) => x.value), name: '类别分布' }],
      areaStyle: { opacity: 0.25 },
      lineStyle: { width: 2, color: '#8e44ad' },
      itemStyle: { color: '#8e44ad' },
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
  document.getElementById('cardCamera').textContent = data.cards.camera_on ? '在线' : '离线';
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

  applyLine(data.timeline);
  applyCategoryBars(data.pie);
  applyRadar(data.bar);
}

document.getElementById('refreshBtn').onclick = async () => {
  await refreshCards();
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
  await refreshAdvanced();
  setInterval(() => {
    refreshCards();
    refreshAdvanced();
  }, 5000);

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

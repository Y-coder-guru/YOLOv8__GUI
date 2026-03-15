const lineChart = echarts.init(document.getElementById('lineChart'));
const pieChart = echarts.init(document.getElementById('pieChart'));
const barChart = echarts.init(document.getElementById('barChart'));
let allCategories = [];
let autoCarousel = null;

function selectedCategories() {
  const select = document.getElementById('categoryFilter');
  return Array.from(select.selectedOptions).map((o) => o.value);
}

function getRangePayload() {
  return {
    range: document.getElementById('rangeType').value,
    start_time: document.getElementById('startTime').value.replace('T', ' '),
    end_time: document.getElementById('endTime').value.replace('T', ' '),
    categories: selectedCategories().join(','),
  };
}

function loadAnim(chart) {
  chart.showLoading('default', { text: '加载中...' });
}

function stopLoadAnim(chart) {
  chart.hideLoading();
}

function applyLine(timeline = []) {
  lineChart.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const p = params[0];
        const dist = p.data?.dist || {};
        const distText = Object.entries(dist).map(([k,v]) => `${k}: ${v}`).join('、') || '无';
        return `时间: ${p.axisValue}<br/>数量: ${p.value}<br/>类别分布: ${distText}`;
      },
    },
    dataZoom: [{ type: 'inside' }, { type: 'slider' }],
    xAxis: { type: 'category', data: timeline.map((x) => x.time) },
    yAxis: { type: 'value' },
    series: [{
      name: '数量', type: 'line', smooth: true,
      data: timeline.map((x) => ({ value: x.value, dist: x.dist })),
      symbolSize: 10,
      emphasis: { scale: 1.4 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(31,119,255,0.45)' },
          { offset: 1, color: 'rgba(31,119,255,0.05)' },
        ]),
      },
      lineStyle: { width: 3, color: '#1f77ff' },
    }],
    animationDuration: 600,
  });
}

function applyPie(pie = []) {
  pieChart.setOption({
    tooltip: { formatter: '{b}<br/>占比: {d}%<br/>数量: {c}' },
    legend: { bottom: 0 },
    series: [{
      type: 'pie',
      radius: ['38%', '72%'],
      roseType: 'radius',
      data: pie,
      selectedMode: 'single',
      itemStyle: {
        borderRadius: 10,
      },
      emphasis: { scale: true, scaleSize: 8 },
      animationType: 'scale',
    }],
  });
}

function applyBar(bar = []) {
  barChart.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: bar.map((x) => x.name) },
    yAxis: { type: 'value' },
    series: [{
      type: 'bar',
      data: bar.map((x) => x.value),
      itemStyle: {
        borderRadius: [8, 8, 0, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#00d2ff' },
          { offset: 1, color: '#3a7bd5' },
        ]),
      },
      emphasis: { itemStyle: { shadowBlur: 15, shadowColor: 'rgba(0,0,0,0.25)' } },
    }],
    animationDuration: 700,
  });
}

async function refreshCards() {
  const res = await fetch('/api/stats/live');
  const data = await res.json();
  if (!data.ok) return;
  animateNumber(document.getElementById('cardEvents'), data.cards.today_events);
  animateNumber(document.getElementById('cardObjects'), data.cards.today_objects);
  animateNumber(document.getElementById('cardUsers'), data.cards.active_users);
  document.getElementById('cardCamera').textContent = data.cards.camera_on ? '开启' : '关闭';
}

async function refreshAdvanced() {
  const q = new URLSearchParams(getRangePayload()).toString();
  [lineChart, pieChart, barChart].forEach(loadAnim);
  const res = await fetch(`/api/stats/advanced?${q}`);
  const data = await res.json();
  [lineChart, pieChart, barChart].forEach(stopLoadAnim);
  if (!data.ok) {
    showToast(`数据加载失败：${data.message || '未知错误'}`, 'danger');
    return;
  }

  const cate = document.getElementById('categoryFilter');
  if (!allCategories.length) {
    allCategories = data.categories;
    cate.innerHTML = allCategories.map((x) => `<option value="${x}">${x}</option>`).join('');
  }

  applyLine(data.timeline);
  applyPie(data.pie);
  applyBar(data.bar);
}

pieChart.on('click', (params) => {
  const target = params.name;
  const select = document.getElementById('categoryFilter');
  Array.from(select.options).forEach((o) => {
    o.selected = o.value === target;
  });
  refreshAdvanced();
});

function startCarousel() {
  if (autoCarousel) clearInterval(autoCarousel);
  autoCarousel = setInterval(() => {
    const data = pieChart.getOption().series?.[0]?.data || [];
    if (!data.length) return;
    const idx = Math.floor(Math.random() * data.length);
    pieChart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: idx });
  }, 3000);
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

document.getElementById('exportCsvBtn').onclick = () => window.open('/api/stats/export?format=csv');
document.getElementById('exportExcelBtn').onclick = () => window.open('/api/stats/export?format=excel');
document.getElementById('exportJsonBtn').onclick = () => window.open('/api/stats/export?format=json');

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
  startCarousel();
  setInterval(() => {
    refreshCards();
    refreshAdvanced();
  }, 5000);
}

init();
window.addEventListener('resize', () => {
  lineChart.resize();
  pieChart.resize();
  barChart.resize();
});

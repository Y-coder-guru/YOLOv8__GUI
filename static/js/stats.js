const lineChart = new Chart(document.getElementById('lineChart'), {
  type: 'line',
  data: { labels: [], datasets: [{ label: '实时目标数', data: [], borderColor: '#1f77ff', tension: 0.3 }] },
  options: { animation: true, responsive: true },
});

const pieChart = new Chart(document.getElementById('pieChart'), {
  type: 'pie',
  data: { labels: [], datasets: [{ data: [], backgroundColor: ['#1f77ff', '#00b894', '#fdcb6e', '#e17055', '#6c5ce7'] }] },
  options: { animation: true, responsive: true },
});

const barChart = new Chart(document.getElementById('barChart'), {
  type: 'bar',
  data: {
    labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
    datasets: [{ label: '每小时目标数量', data: Array(24).fill(0), backgroundColor: '#00cec9' }],
  },
  options: { animation: true, responsive: true },
});

async function refreshStats() {
  const res = await fetch('/api/stats/live');
  const data = await res.json();
  if (!data.ok) return;

  document.getElementById('cardEvents').textContent = data.cards.today_events;
  document.getElementById('cardObjects').textContent = data.cards.today_objects;
  document.getElementById('cardUsers').textContent = data.cards.active_users;
  document.getElementById('cardCamera').textContent = data.cards.camera_on ? '开启' : '关闭';

  lineChart.data.labels = data.line.map((x) => x.time);
  lineChart.data.datasets[0].data = data.line.map((x) => x.value);
  lineChart.update();

  pieChart.data.labels = data.pie.map((x) => x.name);
  pieChart.data.datasets[0].data = data.pie.map((x) => x.value);
  pieChart.update();

  barChart.data.datasets[0].data = data.bar;
  barChart.update();
}

refreshStats();
setInterval(refreshStats, 2500);

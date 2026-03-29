(function () {
  const $ = (id) => document.getElementById(id);

  const state = {
    chart: null,
    history: JSON.parse(localStorage.getItem('number-lab-history') || '[]'),
  };

  function initChart() {
    const dom = $('resultChart');
    if (!dom || typeof echarts === 'undefined') return;
    state.chart = echarts.init(dom);
    state.chart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: ['A', 'B', 'A+B', 'A-B', 'A×B'] },
      yAxis: { type: 'value' },
      series: [{
        type: 'bar',
        data: [0, 0, 0, 0, 0],
        itemStyle: { color: '#4f46e5' },
        label: { show: true, position: 'top' },
      }],
    });
    window.addEventListener('resize', () => state.chart && state.chart.resize());
  }

  function renderHistory() {
    const tbody = $('historyTable')?.querySelector('tbody');
    if (!tbody) return;
    if (!state.history.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-muted text-center">暂无记录</td></tr>';
      return;
    }

    tbody.innerHTML = state.history
      .slice(-8)
      .reverse()
      .map((item) => `
        <tr>
          <td>${item.time}</td>
          <td>${item.a}</td>
          <td>${item.b}</td>
          <td>${item.sum}</td>
        </tr>
      `)
      .join('');
  }

  function renderCodeTable(inputs) {
    const tbody = $('codeTable').querySelector('tbody');
    const rows = [
      ['A', inputs.n1],
      ['B', inputs.n2],
    ];
    tbody.innerHTML = rows
      .map(([label, row]) => `
        <tr>
          <td>${label}</td>
          <td>${row.true_value}</td>
          <td>${row.original_code}</td>
          <td>${row.ones_complement}</td>
          <td>${row.twos_complement}</td>
          <td>${row.biased_code}</td>
        </tr>
      `)
      .join('');
  }

  function updateResultCard(results, outBase) {
    $('sumValue').textContent = `${results.sum.formatted} (base ${outBase})`;
    $('diffValue').textContent = `${results.diff.formatted} (base ${outBase})`;
    $('prodValue').textContent = `${results.product.formatted} (base ${outBase})`;
  }

  function updateChart(n1, n2, results) {
    if (!state.chart) return;
    state.chart.setOption({
      series: [{ data: [n1, n2, Number(results.sum.decimal), Number(results.diff.decimal), Number(results.product.decimal)] }],
    });
  }

  async function compute() {
    const payload = {
      num1: $('num1Input').value,
      base1: Number($('base1Select').value),
      num2: $('num2Input').value,
      base2: Number($('base2Select').value),
      out_base: Number($('outBaseSelect').value),
      bits: Number($('bitsSelect').value),
    };

    try {
      const res = await fetch('/api/number-lab/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data.message || '计算失败', 'danger');
        return;
      }

      const inputs = data.data.inputs;
      const results = data.data.results;
      renderCodeTable(inputs);
      updateResultCard(results, payload.out_base);
      updateChart(Number(inputs.n1.true_value), Number(inputs.n2.true_value), results);

      state.history.push({
        time: data.data.meta.submitted_at,
        a: `${payload.num1}(${payload.base1})`,
        b: `${payload.num2}(${payload.base2})`,
        sum: `${results.sum.formatted}(base ${payload.out_base})`,
      });
      localStorage.setItem('number-lab-history', JSON.stringify(state.history.slice(-30)));
      renderHistory();
      showToast('计算完成', 'success');
    } catch (err) {
      showToast('网络异常，请稍后重试', 'danger');
    }
  }

  function bindEvents() {
    $('computeBtn')?.addEventListener('click', compute);
    $('swapBtn')?.addEventListener('click', () => {
      const num1 = $('num1Input').value;
      const num2 = $('num2Input').value;
      const base1 = $('base1Select').value;
      const base2 = $('base2Select').value;
      $('num1Input').value = num2;
      $('num2Input').value = num1;
      $('base1Select').value = base2;
      $('base2Select').value = base1;
      showToast('已交换 A/B', 'info');
    });
    $('clearBtn')?.addEventListener('click', () => {
      $('num1Input').value = '';
      $('num2Input').value = '';
      $('sumValue').textContent = '-';
      $('diffValue').textContent = '-';
      $('prodValue').textContent = '-';
      showToast('输入已清空', 'secondary');
    });
  }

  initChart();
  renderHistory();
  bindEvents();
})();

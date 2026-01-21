const MAX_POINTS = 60;  // ~2 phút nếu refresh 2s
const REFRESH_MS = 2000;

// thresholds
const TH_CPU_WARN = 75, TH_CPU_BAD = 90;
const TH_RAM_WARN = 80, TH_RAM_BAD = 92;
const TH_SWAP_WARN = 30, TH_SWAP_BAD = 60;

// chart helpers
function makeChart(canvasId, label) {
  const ctx = document.getElementById(canvasId);
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label,
        data: [],
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: { min: 0, max: 100, ticks: { color: 'rgba(255,255,255,.55)' } }
      }
    }
  });
}

function pushPoint(chart, xLabel, value) {
  chart.data.labels.push(xLabel);
  chart.data.datasets[0].data.push(value);
  if (chart.data.labels.length > MAX_POINTS) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update('none');
}

const cpuChart = makeChart('cpuChart', 'CPU');
const ramChart = makeChart('ramChart', 'RAM');

// set fixed height for canvas containers (without CSS frameworks)
document.querySelectorAll('canvas').forEach(c => {
  c.parentElement.style.height = '180px';
});

const setText = (id, v) => (document.getElementById(id).textContent = v);
const setBar  = (id, pct) => (document.getElementById(id).style.width = pct + '%');

function setHealth(level, msg){
  const el = document.getElementById('health');
  el.classList.remove('ok','warn','bad');
  el.classList.add(level);
  el.textContent = msg;
}

function setHint(level, msg){
  const el = document.getElementById('ramWarn');
  el.classList.remove('warn','bad');
  if(level !== 'ok') el.classList.add(level);
  el.textContent = msg;
}

function healthFrom(cpu, ram, swap){
  let alerts = [];
  let level = 'ok';

  const push = (name, lv) => {
    alerts.push(name);
    if (lv === 'bad') level = 'bad';
    else if (lv === 'warn' && level !== 'bad') level = 'warn';
  };

  // CPU
  if (cpu >= TH_CPU_BAD) push('CPU cao', 'bad');
  else if (cpu >= TH_CPU_WARN) push('CPU cao', 'warn');

  // RAM
  if (ram >= TH_RAM_BAD) push('RAM cao', 'bad');
  else if (ram >= TH_RAM_WARN) push('RAM cao', 'warn');

  // SWAP
  if (swap >= TH_SWAP_BAD) push('SWAP cao', 'bad');
  else if (swap >= TH_SWAP_WARN) push('SWAP cao', 'warn');

  return { level, alerts };
}

async function refresh(){
  try{
    const res = await fetch('/api/stats', { cache: 'no-store' });
    const s = await res.json();

    // top chip
    setText('ts', s.ts);

    // CPU panel
    setText('cpu', s.cpu_percent.toFixed(1));
    setBar('cpuBar', s.cpu_percent.toFixed(1));
    setText('cpuModel', s.cpu_model);
    setText('cpuCores', s.cpu_cores);
    setText('cpuThreads', s.cpu_threads);
    setText('cpuArch', s.cpu_arch);

    // RAM panel
    setText('ramPct', s.mem_percent.toFixed(1));
    setText('ramUsed', Math.round(s.mem_used_mb));
    setText('ramTotal', Math.round(s.mem_total_mb));
    setBar('ramBar', s.mem_percent.toFixed(1));

    // Disk
    setText('diskPct', s.disk_percent.toFixed(1));
    setText('diskUsed', s.disk_used_gb.toFixed(1));
    setText('diskTotal', s.disk_total_gb.toFixed(1));
    setBar('diskBar', s.disk_percent.toFixed(1));

    // Swap
    setText('swapPct', s.swap_percent.toFixed(1));
    setText('swapUsed', Math.round(s.swap_used_mb));
    setText('swapTotal', Math.round(s.swap_total_mb));
    setBar('swapBar', s.swap_percent.toFixed(1));

    // health / alerts
    const h = healthFrom(s.cpu_percent, s.mem_percent, s.swap_percent);
    if (h.level === 'ok') setHealth('ok', 'ỔN');
    if (h.level === 'warn') setHealth('warn', 'CẢNH BÁO');
    if (h.level === 'bad') setHealth('bad', 'NGUY HIỂM');

    setText('alerts', h.alerts.length ? h.alerts.join(', ') : 'Không');
    setText('status', 'Đang chạy');

    // RAM hint message
    if (s.mem_percent >= TH_RAM_BAD) {
      setHint('bad', 'RAM rất cao → dễ bị lag/OOM. Nên giảm service hoặc tăng RAM.');
    } else if (s.mem_percent >= TH_RAM_WARN) {
      setHint('warn', 'RAM cao → theo dõi thêm. Nếu SWAP tăng liên tục, VPS sẽ chậm.');
    } else {
      setHint('ok', 'RAM ổn. Nếu SWAP > 0 vẫn có thể bình thường (Linux tối ưu bộ nhớ).');
    }

    // charts
    const t = s.ts.split(' ')[1] || s.ts;
    pushPoint(cpuChart, t, s.cpu_percent);
    pushPoint(ramChart, t, s.mem_percent);
  }catch(e){
    setText('status', 'Mất kết nối');
    setHealth('warn', 'MẤT KẾT NỐI');
    setText('alerts', 'Không cập nhật được');
  }
}

// giảm tốn tài nguyên: chỉ refresh khi tab đang active
let timer = null;
function startTimer(){
  if (timer) return;
  refresh();
  timer = setInterval(refresh, REFRESH_MS);
}
function stopTimer(){
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopTimer();
  else startTimer();
});

startTimer();

// =========================================
// 理研 GX-3R Pro — 正確 UUID
// =========================================
const SERVICE_UUID  = '5699d362-0c53-11e7-93ae-92361f002671';
const CHAR_TX_UUID  = '5699d646-0c53-11e7-93ae-92361f002671';
const CHAR_RX_UUID  = '5699d772-0c53-11e7-93ae-92361f002671';
const CHAR2_TX_UUID = '5699d647-0c53-11e7-93ae-92361f002671';
const CHAR2_RX_UUID = '5699d773-0c53-11e7-93ae-92361f002671';

const GAS_CONFIG = [
  { key: 'CH4', name: '甲烷',     unit: '% LEL', alarm: { max: 10   }, pct: v => Math.min(v / 100 * 100, 100) },
  { key: 'O2',  name: '氧氣',     unit: '%',     alarm: { min: 19.5, max: 23.5 }, pct: v => Math.min(v / 25 * 100, 100) },
  { key: 'H2S', name: '硫化氫',   unit: 'ppm',   alarm: { max: 5    }, pct: v => Math.min(v / 20 * 100, 100) },
  { key: 'CO',  name: '一氧化碳', unit: 'ppm',   alarm: { max: 25   }, pct: v => Math.min(v / 200 * 100, 100) },
  { key: 'CO2', name: '二氧化碳', unit: 'ppm',   alarm: { max: 5000 }, pct: v => Math.min(v / 10000 * 100, 100) },
];

let rxCharacteristic  = null;
let rx2Characteristic = null;
let pollTimer = null;

// =========================================
// 數據記錄
// =========================================
let dataLog = [];         // 記憶體中的數據
let isRecording = false;  // 是否正在記錄
const MAX_RECORDS = 86400; // 最多保留 86400 筆（每秒1筆 = 24小時）

function startRecording() {
  isRecording = true;
  dataLog = [];
  document.getElementById('recBtn').textContent = '⏹ 停止記錄';
  document.getElementById('recBtn').classList.add('recording');
  document.getElementById('recCount').textContent = '已記錄：0 筆';
  document.getElementById('exportBtn').disabled = true;
  log('開始記錄數據...', 'ok');
}

function stopRecording() {
  isRecording = false;
  document.getElementById('recBtn').textContent = '⏺ 開始記錄';
  document.getElementById('recBtn').classList.remove('recording');
  document.getElementById('exportBtn').disabled = dataLog.length === 0;
  log(`停止記錄，共 ${dataLog.length} 筆`, 'ok');
}

function addRecord(values, status, battVolt, rawHex, rawText) {
  if (!isRecording) return;
  const now = new Date();
  const record = {
    timestamp: now.toISOString(),
    date: now.toLocaleDateString('zh-TW'),
    time: now.toLocaleTimeString('zh-TW'),
    CH4:  values[0],
    O2:   values[1],
    H2S:  values[2],
    CO:   values[3],
    CO2:  values[4],
    status:  status  || '',
    battV:   battVolt || '',
    rawHex:  rawHex  || '',
    rawText: rawText || '',
  };
  dataLog.push(record);
  if (dataLog.length > MAX_RECORDS) dataLog.shift();
  document.getElementById('recCount').textContent = `已記錄：${dataLog.length} 筆`;
}

function exportCSV() {
  if (dataLog.length === 0) return;

  const headers = ['時間戳(ISO)', '日期', '時間', 'CH4(%LEL)', 'O2(%)', 'H2S(ppm)', 'CO(ppm)', 'CO2(ppm)', '狀態碼', '電池電壓(V)', '原始封包(hex)', '原始封包(文字)'];
  const rows = dataLog.map(r => [
    r.timestamp, r.date, r.time,
    r.CH4, r.O2, r.H2S, r.CO, r.CO2,
    r.status, r.battV,
    `"${r.rawHex}"`, `"${r.rawText}"`
  ].join(','));

  const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n'); // \uFEFF = BOM，讓 Excel 正確顯示中文
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);

  const now = new Date();
  const filename = `GX3R_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}.csv`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  log(`匯出 CSV：${filename}（${dataLog.length} 筆）`, 'ok');
}

// =========================================
// SUM checksum
// =========================================
function calcSum(payload) {
  let sum = 0x02;
  for (let i = 0; i < payload.length; i++) sum += payload.charCodeAt(i);
  sum += 0x03;
  return (((~sum) + 1) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function buildPacket(cmdBody) {
  const payload = '0000' + cmdBody;
  const packet  = '\x02' + payload + '\x03' + calcSum(payload) + '\x04';
  return new TextEncoder().encode(packet);
}

// =========================================
// Log 工具
// =========================================
function log(msg, type = '') {
  const el = document.getElementById('log');
  const p  = document.createElement('p');
  if (type) p.className = type;
  p.textContent = `[${new Date().toLocaleTimeString('zh-TW')}] ${msg}`;
  el.appendChild(p);
  el.scrollTop = el.scrollHeight;
  while (el.children.length > 80) el.removeChild(el.firstChild);
}

function setStatus(text, cls = '') {
  const el = document.getElementById('status-badge');
  el.textContent = `● ${text}`;
  el.className = cls;
}

// =========================================
// 更新卡片數值
// =========================================
function updateCard(idx, rawVal) {
  const cfg     = GAS_CONFIG[idx];
  if (!cfg) return;
  const trimmed = rawVal.trim();
  const valEl   = document.getElementById(`val-${cfg.key}`);
  const barEl   = document.getElementById(`bar-${cfg.key}`);
  const card    = document.getElementById(`card-${cfg.key}`);

  if (['********', 'INITFAIL', 'FAIL'].includes(trimmed)) {
    valEl.textContent = trimmed === '********' ? 'OFF' : trimmed;
    return trimmed;
  }

  const num = parseFloat(trimmed.replace(/[^0-9.\-]/g, ''));
  if (isNaN(num)) { valEl.textContent = trimmed; return trimmed; }

  valEl.textContent = num.toFixed(
    cfg.key === 'O2' ? 1 : (cfg.key === 'CO2' || cfg.key === 'CO' ? 0 : 1)
  );
  barEl.style.width = cfg.pct(num) + '%';

  let alarm = false;
  if (cfg.alarm.max !== undefined && num >= cfg.alarm.max) alarm = true;
  if (cfg.alarm.min !== undefined && num <= cfg.alarm.min) alarm = true;
  if (cfg.key === 'O2' && num >= 23.5) alarm = true;
  card.classList.toggle('alarm', alarm);

  document.getElementById('ts').textContent = '最後更新：' + new Date().toLocaleString('zh-TW');
  return num;
}

// =========================================
// 解析封包
// =========================================
let rxBuffer = '';

function parseResponse(raw) {
  rxBuffer += raw;
  let eotIdx;
  while ((eotIdx = rxBuffer.indexOf('\x04')) !== -1) {
    const packet = rxBuffer.slice(0, eotIdx + 1);
    rxBuffer = rxBuffer.slice(eotIdx + 1);
    processPacket(packet);
  }
}

function processPacket(packet) {
  const stxIdx = packet.indexOf('\x02');
  const etxIdx = packet.indexOf('\x03');
  if (stxIdx === -1 || etxIdx === -1) return;

  const content = packet.slice(stxIdx + 1, etxIdx).slice(4);
  const parts   = content.split(',');
  const cmd = parts[0], sub = parts[1];

  // 快照原始數據後重置（每個完整封包存一份）
  const snapHex  = lastRawHex.trim();
  const snapText = lastRawText.trim();
  lastRawHex  = '';
  lastRawText = '';

  if (cmd === 'DH' && sub === 'R') {
    if (parts.length >= 12) {
      const status   = parts[2];
      const battVolt = parts[5];
      const values   = [];
      for (let i = 0; i < 5; i++) {
        const v = updateCard(i, parts[7 + i]);
        values.push(typeof v === 'number' ? v : parts[7 + i].trim());
      }
      addRecord(values, status, battVolt, snapHex, snapText);
    } else {
      log(`⚠ DH 欄位數不足 (${parts.length})`, 'warn');
    }
  } else if (cmd === 'RC' && sub === 'R') {
    log(`裝置型號: ${parts[2] || '?'}`, 'ok');
  } else if (parts[parts.length - 1] === 'NAK') {
    log(`NAK 錯誤: ${content}`, 'err');
  }
}

// =========================================
// BLE
// =========================================
let lastRawHex  = '';
let lastRawText = '';

function handleNotification(event) {
  const bytes = new Uint8Array(event.target.value.buffer);
  lastRawHex  += Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join(' ') + ' ';
  const text   = new TextDecoder('utf-8').decode(event.target.value);
  lastRawText += text;
  parseResponse(text);
}

async function sendCommand(cmdBody, useChar2 = false) {
  const char = useChar2 ? rx2Characteristic : rxCharacteristic;
  if (!char) return;
  try {
    await char.writeValue(buildPacket(cmdBody));
  } catch (err) {
    log('TX 失敗: ' + err.message, 'err');
  }
}

function startPolling() {
  stopPolling();
  sendCommand('RC,R,');
  setTimeout(() => sendCommand('DH,R,'), 300);
  pollTimer = setInterval(() => sendCommand('DH,R,'), 1000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function connectToDevice() {
  const btn = document.getElementById('connectBtn');
  btn.disabled = true;
  setStatus('搜尋中...', 'connecting');
  log('搜尋 GX-3R Pro...', 'warn');

  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'GX-3R' }, { namePrefix: 'GX3R' }],
      optionalServices: [SERVICE_UUID]
    });

    log(`找到: ${device.name}`, 'ok');
    setStatus('連線中...', 'connecting');

    device.addEventListener('gattserverdisconnected', () => {
      stopPolling();
      if (isRecording) stopRecording();
      setStatus('已斷線', 'error');
      log('已斷線', 'err');
      btn.disabled = false;
      btn.textContent = '▶ 重新連線';
    });

    const server  = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    const txChar  = await service.getCharacteristic(CHAR_TX_UUID);
    rxCharacteristic = await service.getCharacteristic(CHAR_RX_UUID);

    await txChar.startNotifications();
    txChar.addEventListener('characteristicvaluechanged', handleNotification);
    log('連線成功！', 'ok');

    try {
      const tx2 = await service.getCharacteristic(CHAR2_TX_UUID);
      rx2Characteristic = await service.getCharacteristic(CHAR2_RX_UUID);
      await tx2.startNotifications();
      tx2.addEventListener('characteristicvaluechanged', handleNotification);
    } catch { /* Char2 非必要 */ }

    setStatus('已連線', 'connected');
    btn.textContent = '✓ 已連線';
    document.getElementById('recBtn').disabled = false;
    startPolling();

  } catch (err) {
    setStatus('連線失敗', 'error');
    log('錯誤：' + err.message, 'err');
    btn.disabled = false;
    btn.textContent = '▶ 重試連線';
  }
}

// =========================================
// 初始化
// =========================================
document.getElementById('connectBtn').addEventListener('click', connectToDevice);

document.getElementById('recBtn').addEventListener('click', () => {
  isRecording ? stopRecording() : startRecording();
});

document.getElementById('exportBtn').addEventListener('click', exportCSV);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

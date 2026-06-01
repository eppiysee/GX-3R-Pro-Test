// =========================================
// 理研 GX-3R Pro — 正確 UUID（來自規格書）
// =========================================
// Service UUID（私有服務）
const SERVICE_UUID   = '5699d362-0c53-11e7-93ae-92361f002671';

// Characteristic_1 Tx (Peripheral → Central) ← 接收氣體數據
const CHAR_TX_UUID   = '5699d646-0c53-11e7-93ae-92361f002671';

// Characteristic_1 Rx (Central → Peripheral) ← 發送指令
const CHAR_RX_UUID   = '5699d772-0c53-11e7-93ae-92361f002671';

// Characteristic_2 Tx (Peripheral → Central) ← 接收設定回應
const CHAR2_TX_UUID  = '5699d647-0c53-11e7-93ae-92361f002671';

// Characteristic_2 Rx (Central → Peripheral) ← 發送設定指令
const CHAR2_RX_UUID  = '5699d773-0c53-11e7-93ae-92361f002671';

// =========================================
// 警報閾值（可依需求調整）
// =========================================
const ALARM = {
  CH4: { max: 10,    pct: (v) => Math.min(v / 100 * 100, 100) },   // 10% LEL = 警報
  O2:  { min: 19.5, max: 23.5, pct: (v) => Math.min(v / 25 * 100, 100) },
  CO:  { max: 25,    pct: (v) => Math.min(v / 200 * 100, 100) },   // 25 ppm = 警報
  H2S: { max: 5,     pct: (v) => Math.min(v / 20 * 100, 100) },    // 5 ppm = 警報
  CO2: { max: 5000,  pct: (v) => Math.min(v / 10000 * 100, 100) }, // 5000 ppm = 警報
};

let rxCharacteristic = null;
let pollTimer = null;

// =========================================
// 工具：寫 Log
// =========================================
function log(msg, type = '') {
  const el = document.getElementById('log');
  const p = document.createElement('p');
  if (type) p.className = type;
  const now = new Date().toLocaleTimeString('zh-TW');
  p.textContent = `[${now}] ${msg}`;
  el.appendChild(p);
  el.scrollTop = el.scrollHeight;
  // 最多保留 50 行
  while (el.children.length > 50) el.removeChild(el.firstChild);
}

function setStatus(text, cls = '') {
  const el = document.getElementById('status-badge');
  el.textContent = `● ${text}`;
  el.className = cls;
}

// =========================================
// 更新 UI 數值
// =========================================
function updateCard(key, rawVal) {
  const num = parseFloat(rawVal);
  if (isNaN(num)) return;

  document.getElementById(`val-${key}`).textContent = num.toFixed(
    key === 'O2' ? 1 : (key === 'CO2' ? 0 : 1)
  );

  const cfg = ALARM[key];
  const pct = cfg.pct(num);
  document.getElementById(`bar-${key}`).style.width = pct + '%';

  // 警報判斷
  const card = document.getElementById(`card-${key}`);
  let alarmOn = false;
  if (cfg.max !== undefined && num >= cfg.max) alarmOn = true;
  if (cfg.min !== undefined && num <= cfg.min) alarmOn = true;
  if (key === 'O2' && num >= 23.5) alarmOn = true;
  card.classList.toggle('alarm', alarmOn);

  document.getElementById('ts').textContent =
    '最後更新：' + new Date().toLocaleString('zh-TW');
}

// =========================================
// 解析 BLE 數據封包
// 格式範例：DH,R,0,2.1,20.9,0.0,0.0,0\r
// 順序：CH4, O2, CO, H2S（基本4氣）
// CO2 通常在另一個 characteristic 或不同封包
// =========================================
let buffer = '';

function parseData(raw) {
  buffer += raw;

  // 以 \r 或 \n 分割完整封包
  const lines = buffer.split(/[\r\n]+/);
  buffer = lines.pop(); // 最後可能不完整，保留

  for (const line of lines) {
    if (!line.trim()) continue;
    log(`RX: ${line}`);

    // DH 指令回應（主要氣體數據）
    // 格式：DH,R,<status>,<CH4>,<O2>,<CO>,<H2S>[,<CO2>]
    if (line.startsWith('DH,R') || line.includes('DH,R')) {
      const p = line.split(',');
      // p[0]=DH  p[1]=R  p[2]=status  p[3]=CH4  p[4]=O2  p[5]=CO  p[6]=H2S  p[7]=CO2(如有)
      if (p.length >= 7) {
        updateCard('CH4', p[3]);
        updateCard('O2',  p[4]);
        updateCard('CO',  p[5]);
        updateCard('H2S', p[6]);
        if (p[7] !== undefined) updateCard('CO2', p[7]);
      }
    }

    // DC 指令回應（部分韌體用 DC 回應 CO2）
    // 格式：DC,R,<status>,<CO2>
    if (line.startsWith('DC,R') || line.includes('DC,R')) {
      const p = line.split(',');
      if (p.length >= 4) updateCard('CO2', p[3]);
    }
  }
}

// =========================================
// BLE Notification Handler
// =========================================
function handleNotification(event) {
  const raw = new TextDecoder('utf-8').decode(event.target.value);
  parseData(raw);
}

// =========================================
// 發送指令
// =========================================
async function sendCommand(cmd) {
  if (!rxCharacteristic) return;
  try {
    const encoded = new TextEncoder().encode(cmd + '\r');
    await rxCharacteristic.writeValue(encoded);
    log(`TX: ${cmd.trim()}`, '');
  } catch (err) {
    log('指令發送失敗: ' + err.message, 'err');
  }
}

// 定期輪詢（每秒發一次 DH 指令取得數據）
function startPolling() {
  stopPolling();
  sendCommand('DH');          // 立即取一次
  pollTimer = setInterval(() => {
    sendCommand('DH');        // 取 CH4/O2/CO/H2S
    // 若設備支援 DC 指令取 CO2，取消下行註解：
    // setTimeout(() => sendCommand('DC'), 300);
  }, 1000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// =========================================
// 連線主流程
// =========================================
async function connectToDevice() {
  const btn = document.getElementById('connectBtn');
  btn.disabled = true;
  setStatus('搜尋中...', 'connecting');
  log('開始搜尋 GX-3R Pro...', 'warn');

  try {
    // 1. 掃描裝置
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { namePrefix: 'GX-3R' },
        { namePrefix: 'GX3R'  },
      ],
      optionalServices: [SERVICE_UUID]
    });

    log(`找到裝置：${device.name}`, 'ok');
    setStatus('連線中...', 'connecting');

    // 裝置斷線事件
    device.addEventListener('gattserverdisconnected', () => {
      stopPolling();
      setStatus('已斷線', 'error');
      log('裝置已斷線', 'err');
      btn.disabled = false;
      btn.textContent = '▶ 重新連線';
    });

    // 2. 連接 GATT
    const server  = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);

    // 3. 取得 Characteristics
    const txChar = await service.getCharacteristic(CHAR_TX_UUID);   // 接收數據
    rxCharacteristic = await service.getCharacteristic(CHAR_RX_UUID); // 發送指令

    // 4. 啟用 Notification（從裝置接收推播數據）
    await txChar.startNotifications();
    txChar.addEventListener('characteristicvaluechanged', handleNotification);

    // 嘗試訂閱 Characteristic_2（設定頻道，可能含 CO2）
    try {
      const tx2Char = await service.getCharacteristic(CHAR2_TX_UUID);
      await tx2Char.startNotifications();
      tx2Char.addEventListener('characteristicvaluechanged', handleNotification);
      log('設定頻道訂閱成功', 'ok');
    } catch {
      log('設定頻道不支援（忽略）', '');
    }

    setStatus('已連線', 'connected');
    log(`連線成功！開始接收數據`, 'ok');
    btn.textContent = '✓ 已連線';

    // 5. 開始輪詢
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

// Service Worker 註冊（PWA 離線支援）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(() => log('PWA Service Worker 已就緒', 'ok'))
      .catch(e => log('SW 註冊失敗: ' + e.message, ''));
  });
}

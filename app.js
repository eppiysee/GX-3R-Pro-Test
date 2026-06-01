// =========================================
// 理研 GX-3R Pro — 正確 UUID
// =========================================
const SERVICE_UUID  = '5699d362-0c53-11e7-93ae-92361f002671';
const CHAR_TX_UUID  = '5699d646-0c53-11e7-93ae-92361f002671'; // Peripheral→Central (接收)
const CHAR_RX_UUID  = '5699d772-0c53-11e7-93ae-92361f002671'; // Central→Peripheral (發送)
const CHAR2_TX_UUID = '5699d647-0c53-11e7-93ae-92361f002671';
const CHAR2_RX_UUID = '5699d773-0c53-11e7-93ae-92361f002671';

// =========================================
// 警報閾值
// =========================================
// Gas1=CH4(%LEL), Gas2=O2(%), Gas3=H2S(ppm), Gas4=CO(ppm), Gas5=CO2(ppm)
// 注意：GJ 命令範例顯示順序為 CH4, O2, H2S, CO, SO2
// 你的裝置實際順序以 GJ 命令回應為準
const GAS_CONFIG = [
  { key: 'CH4', name: '甲烷',    unit: '% LEL', alarm: { max: 10  }, pct: v => Math.min(v / 100 * 100, 100) },
  { key: 'O2',  name: '氧氣',    unit: '%',     alarm: { min: 19.5, max: 23.5 }, pct: v => Math.min(v / 25 * 100, 100) },
  { key: 'H2S', name: '硫化氫',  unit: 'ppm',   alarm: { max: 5   }, pct: v => Math.min(v / 20 * 100, 100) },
  { key: 'CO',  name: '一氧化碳',unit: 'ppm',   alarm: { max: 25  }, pct: v => Math.min(v / 200 * 100, 100) },
  { key: 'CO2', name: '二氧化碳',unit: 'ppm',   alarm: { max: 5000}, pct: v => Math.min(v / 10000 * 100, 100) },
];

let rxCharacteristic  = null;
let rx2Characteristic = null;
let pollTimer = null;

// =========================================
// 計算 SUM checksum
// 規格書：STX(0x02) + Address + Channel + CMD 直到 ETX(0x03) 的總和，
//         取低位 1 byte，轉 2-byte ASCII hex，取其補數（即 0x10000 - SUM 的低16位）
// 範例：STX0000SZ,W,ETX → SUM = DF
// =========================================
function calcSum(payload) {
  // payload = Address(2) + Channel(2) + CMD_body（不含 STX 和 ETX）
  // 實際上規格書 SUM 包含 STX 到 ETX 的所有 byte
  let sum = 0x02; // STX
  for (let i = 0; i < payload.length; i++) {
    sum += payload.charCodeAt(i);
  }
  sum += 0x03; // ETX
  // 取低 8 bit 的補數（規格書範例驗證：0x0221 → SUM=DF → 0xFF - (0x21 & 0xFF) = DE? 再看範例）
  // 規格書範例：0x0221 → 0xFDDF → DF is SUM
  // 即：SUM = (~sum) & 0xFF，再轉 2-byte hex
  const sumByte = ((~sum) + 1) & 0xFF;
  return sumByte.toString(16).toUpperCase().padStart(2, '0');
}

// =========================================
// 建立完整指令封包
// 格式：STX(02) + "0000" + cmd_body + ETX(03) + SUM(2 bytes) + EOT(04)
// =========================================
function buildPacket(cmdBody) {
  const addr    = '0000'; // Address 00 + Channel 00
  const payload = addr + cmdBody;
  const sum     = calcSum(payload);
  // 組裝 binary
  const packet = '\x02' + payload + '\x03' + sum + '\x04';
  return new TextEncoder().encode(packet);
}

// =========================================
// Log 工具
// =========================================
function log(msg, type = '') {
  const el = document.getElementById('log');
  const p  = document.createElement('p');
  if (type) p.className = type;
  const t = new Date().toLocaleTimeString('zh-TW');
  p.textContent = `[${t}] ${msg}`;
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
  const cfg = GAS_CONFIG[idx];
  if (!cfg) return;
  const trimmed = rawVal.trim();

  const valEl = document.getElementById(`val-${cfg.key}`);
  const barEl = document.getElementById(`bar-${cfg.key}`);
  const card  = document.getElementById(`card-${cfg.key}`);

  if (trimmed === '********' || trimmed === 'INITFAIL' || trimmed === 'FAIL') {
    valEl.textContent = trimmed === '********' ? 'OFF' : trimmed;
    return;
  }

  const num = parseFloat(trimmed.replace(/[^0-9.-]/g, ""));
  if (isNaN(num)) { valEl.textContent = trimmed; return; }

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
}

// =========================================
// 解析回應封包
// 完整格式：STX 0000 DH,R, Data1,...,Data10, ETX SUM EOT
// 資料以 "," 分隔，ETX(03) 之前結束
// =========================================
let rxBuffer = '';

function parseResponse(raw) {
  rxBuffer += raw;

  // 找完整封包（以 EOT \x04 結尾）
  let eotIdx;
  while ((eotIdx = rxBuffer.indexOf('\x04')) !== -1) {
    const packet = rxBuffer.slice(0, eotIdx + 1);
    rxBuffer     = rxBuffer.slice(eotIdx + 1);
    processPacket(packet);
  }
}

function processPacket(packet) {
  // 移除 STX(02), ETX(03), SUM(2), EOT(04)
  // 格式：\x02 BODY \x03 SS \x04
  const stxIdx = packet.indexOf('\x02');
  const etxIdx = packet.indexOf('\x03');
  if (stxIdx === -1 || etxIdx === -1) return;

  const body = packet.slice(stxIdx + 1, etxIdx); // "0000DH,R,..."
  // 移除前 4 byte Address+Channel
  const content = body.slice(4); // "DH,R,..."
  log(`RX: ${content}`, 'ok');

  const parts = content.split(',');
  const cmd   = parts[0]; // "DH"
  const sub   = parts[1]; // "R"

  if (cmd === 'DH' && sub === 'R') {
    // parts[2]=Status, parts[3]=Mode, parts[4]=AlarmStatus,
    // parts[5]=BattVolt, parts[6]=BattLevel,
    // parts[7..11] = Gas1..Gas5 concentration
    if (parts.length >= 12) {
      for (let i = 0; i < 5; i++) {
        updateCard(i, parts[7 + i]);
      }
    } else {
      log(`⚠ DH 欄位數不足 (${parts.length})，原始: ${content}`, 'warn');
    }
  } else if (cmd === 'RC' && sub === 'R') {
    log(`裝置型號: ${parts[2] || '?'}`, 'ok');
  } else if (parts[parts.length - 1] === 'NAK') {
    log(`NAK 錯誤回應: ${content}`, 'err');
  }
}

// =========================================
// BLE Notification Handler
// =========================================
function handleNotification(event) {
  const raw = new TextDecoder('utf-8').decode(event.target.value);
  // 顯示 hex 供除錯
  const bytes = new Uint8Array(event.target.value.buffer);
  const hex   = Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join(' ');
  log(`RAW hex: ${hex}`, '');
  parseResponse(raw);
}

// =========================================
// 發送指令
// =========================================
async function sendCommand(cmdBody, useChar2 = false) {
  log(`TX[v3]: ${cmdBody}`, "");
  const char = useChar2 ? rx2Characteristic : rxCharacteristic;
  if (!char) return;
  try {
    const packet = buildPacket(cmdBody);
    await char.writeValue(packet);
  } catch (err) {
    log('TX 失敗: ' + err.message, 'err');
  }
}

// =========================================
// 輪詢
// =========================================
function startPolling() {
  stopPolling();
  // 先發 RC 確認連線
  sendCommand('RC,R,');
  setTimeout(() => sendCommand('DH,R,'), 300);

  pollTimer = setInterval(() => {
    sendCommand('DH,R,');
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
  log('搜尋 GX-3R Pro...', 'warn');

  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { namePrefix: 'GX-3R' },
        { namePrefix: 'GX3R'  },
      ],
      optionalServices: [SERVICE_UUID]
    });

    log(`找到: ${device.name}`, 'ok');
    setStatus('連線中...', 'connecting');

    device.addEventListener('gattserverdisconnected', () => {
      stopPolling();
      setStatus('已斷線', 'error');
      log('已斷線', 'err');
      btn.disabled = false;
      btn.textContent = '▶ 重新連線';
    });

    const server  = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);

    // 取得 Characteristics
    const txChar = await service.getCharacteristic(CHAR_TX_UUID);
    rxCharacteristic = await service.getCharacteristic(CHAR_RX_UUID);

    // 訂閱 Characteristic_1 Tx（氣體數據）
    await txChar.startNotifications();
    txChar.addEventListener('characteristicvaluechanged', handleNotification);
    log('Char1 Tx 訂閱成功', 'ok');

    // 嘗試訂閱 Characteristic_2 Tx（設定頻道）
    try {
      const tx2 = await service.getCharacteristic(CHAR2_TX_UUID);
      rx2Characteristic = await service.getCharacteristic(CHAR2_RX_UUID);
      await tx2.startNotifications();
      tx2.addEventListener('characteristicvaluechanged', handleNotification);
      log('Char2 Tx 訂閱成功', 'ok');
    } catch {
      log('Char2 不可用（忽略）', '');
    }

    setStatus('已連線', 'connected');
    log('連線成功！開始輪詢...', 'ok');
    btn.textContent = '✓ 已連線';
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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(() => log('PWA 就緒', 'ok'))
      .catch(() => {});
  });
}

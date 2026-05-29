// ==========================================
// 理研 GX-3R Pro - 最終成功運行版 app.js
// ==========================================

const RIKEN_SERVICE_UUID = '5699d362-0c53-11e7-93ae-92361f002671';
const WRITE_CHAR_UUID    = '5699d772-0c53-11e7-93ae-92361f002671';
const NOTIFY_CHAR_UUID   = '5699d646-0c53-11e7-93ae-92361f002671';

let writeCharacteristic;

// 1. 核心：根據手冊規範組裝與發送封包
async function sendCommand() {
    if (!writeCharacteristic) return;

    // 手冊標準指令 (Address:00, Channel:00, Command:DH, Subcommand:R)
    const data = "0000DH,R"; 
    const STX = 0x02;
    const ETX = 0x03;
    const EOT = 0x04;
    
    // 計算 SUM (依據手冊規範：STX 到 ETX 間所有位元組總和)
    let sumVal = STX + ETX;
    for (let i = 0; i < data.length; i++) sumVal += data.charCodeAt(i);
    const sumHex = (sumVal & 0xFF).toString(16).toUpperCase().padStart(2, '0');

    // 組裝封包: [STX] [Data] [ETX] [SUM_ASCII] [EOT]
    const encoder = new TextEncoder();
    const dataArr = encoder.encode(data);
    const sumArr = encoder.encode(sumHex);
    const packet = new Uint8Array(1 + dataArr.length + 1 + sumArr.length + 1);
    
    packet[0] = STX;
    packet.set(dataArr, 1);
    packet[1 + dataArr.length] = ETX;
    packet.set(sumArr, 1 + dataArr.length + 1);
    packet[packet.length - 1] = EOT;

    await writeCharacteristic.writeValue(packet);
    console.log("已發送封包:", packet);
}

// 2. 初始化連線與數據監聽
async function connectToRiken() {
    try {
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [RIKEN_SERVICE_UUID] }]
        });
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(RIKEN_SERVICE_UUID);
        
        writeCharacteristic = await service.getCharacteristic(WRITE_CHAR_UUID);
        const notifyChar = await service.getCharacteristic(NOTIFY_CHAR_UUID);

        await notifyChar.startNotifications();
        notifyChar.oncharacteristicvaluechanged = (e) => {
            const raw = new TextDecoder().decode(e.target.value);
            parseAndDisplay(raw);
        };

        document.getElementById('status').innerText = "已連線，讀取中...";
        // 啟動定時讀取循環
        setInterval(sendCommand, 2000); 
    } catch (e) {
        document.getElementById('status').innerText = "連線失敗: " + e.message;
    }
}

// 3. 數據解析與網頁渲染
function parseAndDisplay(raw) {
    console.log("收到數據:", raw);
    const parts = raw.split(',');
    
    // 檢查欄位是否存在並渲染
    if (parts.length >= 4) {
        document.getElementById('gas-display').innerHTML = `
            <div style="padding: 20px; border: 2px solid #2ecc71; border-radius: 10px; background: #f0fff4;">
                <h3 style="margin:0; color:#27ae60;">氧氣濃度 (O₂)</h3>
                <div style="font-size: 40px; font-weight: bold; color: #2ecc71;">${parts[3]} %</div>
            </div>
        `;
    }
}
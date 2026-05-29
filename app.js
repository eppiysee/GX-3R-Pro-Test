// ==========================================
// 理研 GX-3R Pro - 最終渲染強化版 app.js
// ==========================================

const RIKEN_SERVICE_UUID = '5699d362-0c53-11e7-93ae-92361f002671';
const WRITE_CHAR_UUID    = '5699d772-0c53-11e7-93ae-92361f002671';
const NOTIFY_CHAR_UUID   = '5699d646-0c53-11e7-93ae-92361f002671';

let writeCharacteristic;

async function sendCommand() {
    if (!writeCharacteristic) return;
    const data = "0000DH,R";
    const STX = 0x02; const ETX = 0x03; const EOT = 0x04;
    let sumVal = STX + ETX;
    for (let i = 0; i < data.length; i++) sumVal += data.charCodeAt(i);
    const sumHex = (sumVal & 0xFF).toString(16).toUpperCase().padStart(2, '0');
    const encoder = new TextEncoder();
    const packet = new Uint8Array(1 + data.length + 1 + 2 + 1);
    packet[0] = STX; packet.set(encoder.encode(data), 1);
    packet[1 + data.length] = ETX; packet.set(encoder.encode(sumHex), 1 + data.length + 1);
    packet[packet.length - 1] = EOT;
    await writeCharacteristic.writeValue(packet);
}

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
            // 這裡強制渲染
            document.getElementById('gas-display').innerHTML = `
                <div style="padding: 20px; background: #e8f8f5; border: 2px solid #27ae60;">
                    <h3>原始數據:</h3>
                    <p>${raw}</p>
                    <hr>
                    <h3>氧氣濃度:</h3>
                    <div style="font-size:30px; font-weight:bold; color:green;">
                        ${raw.split(',')[3] || '讀取中...'} %
                    </div>
                </div>
            `;
        };
        document.getElementById('status').innerText = "已成功連線，接收數據中...";
        setInterval(sendCommand, 2000); 
    } catch (e) {
        document.getElementById('status').innerText = "連線失敗: " + e.message;
    }
}
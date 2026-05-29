const RIKEN_SERVICE_UUID = '5699d362-0c53-11e7-93ae-92361f002671';
const WRITE_CHAR_UUID    = '5699d772-0c53-11e7-93ae-92361f002671';
const NOTIFY_CHAR_UUID   = '5699d646-0c53-11e7-93ae-92361f002671';

let writeChar;

// 依據規格書計算 Checksum
function calculateCheckSum(cmd) {
    let sum = 0x02 + 0x03; // STX + ETX
    for (let i = 0; i < cmd.length; i++) sum += cmd.charCodeAt(i);
    return (sum & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

async function sendCommand() {
    if (!writeChar) return;
    const cmd = "0000DH,R"; // 讀取數據指令
    const sum = calculateCheckSum(cmd);
    const encoder = new TextEncoder();
    
    // 封包: STX(0x02) + DATA + ETX(0x03) + SUM + EOT(0x04)
    const packet = new Uint8Array([0x02, ...encoder.encode(cmd), 0x03, ...encoder.encode(sum), 0x04]);
    await writeChar.writeValue(packet);
}

async function connectToRiken() {
    try {
        const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [RIKEN_SERVICE_UUID] }] });
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(RIKEN_SERVICE_UUID);
        writeChar = await service.getCharacteristic(WRITE_CHAR_UUID);
        const notifyChar = await service.getCharacteristic(NOTIFY_CHAR_UUID);

        await notifyChar.startNotifications();
        notifyChar.oncharacteristicvaluechanged = (e) => {
            const raw = new TextDecoder().decode(e.target.value);
            document.getElementById('raw-log').innerText = "原始數據: " + raw;
            // 若為數據回應，解析字串 (以逗號分隔)
            if (raw.includes("DH,R")) {
                const parts = raw.split(',');
                if (parts.length >= 8) {
                    document.getElementById('CH4').innerText = parts[3];
                    document.getElementById('O2').innerText = parts[4];
                    document.getElementById('CO').innerText = parts[5];
                    document.getElementById('H2S').innerText = parts[6];
                    document.getElementById('CO2').innerText = parts[7];
                }
            }
        };
        setInterval(sendCommand, 1000); // 規格書建議 1 秒週期
    } catch (e) { alert("連線錯誤: " + e.message); }
}
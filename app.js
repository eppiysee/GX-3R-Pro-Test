// ==========================================
// 理研 GX-3R Pro 通訊手冊標準版 app.js
// ==========================================

const RIKEN_SERVICE_UUID = '5699d362-0c53-11e7-93ae-92361f002671';
const WRITE_CHAR_UUID    = '5699d772-0c53-11e7-93ae-92361f002671';
const NOTIFY_CHAR_UUID   = '5699d646-0c53-11e7-93ae-92361f002671';

let writeCharacteristic;
let notifyCharacteristic;

// 根據手冊規範計算 SUM 並組裝封包
async function sendCorrectedCommand() {
    if (!writeCharacteristic) return;

    // 1. 定義基礎指令 (Address:00, Channel:00, Command:DH, Subcommand:R)
    // 依據手冊，資料內容為 "0000DH,R"
    const baseCommand = "0000DH,R";
    const STX = 0x02;
    const ETX = 0x03;
    const EOT = 0x04;

    // 2. 計算 SUM: 將 STX 到 ETX 之間的字元 Hex 相加
    let sum = STX;
    for (let i = 0; i < baseCommand.length; i++) {
        sum += baseCommand.charCodeAt(i);
    }
    sum += ETX;
    
    // 取最後 2 位元組，轉為大寫 Hex 字串
    const hexSum = (sum & 0xFF).toString(16).toUpperCase().padStart(2, '0');

    // 3. 將封包內容編碼為 Uint8Array
    const encoder = new TextEncoder();
    const cmdPart = encoder.encode(baseCommand);
    const sumPart = encoder.encode(hexSum);
    
    // 總長度: STX(1) + Command(N) + ETX(1) + SUM(2) + EOT(1)
    const fullPacket = new Uint8Array(1 + cmdPart.length + 1 + sumPart.length + 1);
    
    fullPacket[0] = STX;
    fullPacket.set(cmdPart, 1);
    fullPacket[1 + cmdPart.length] = ETX;
    fullPacket.set(sumPart, 1 + cmdPart.length + 1);
    fullPacket[fullPacket.length - 1] = EOT;

    // 4. 發送封包
    try {
        await writeCharacteristic.writeValue(fullPacket);
        console.log("已送出依照手冊規範組裝的封包:", fullPacket);
    } catch (e) {
        console.error("發送錯誤:", e);
    }
}

// 連線主邏輯 (保留連線與監聽)
async function connectToRiken() {
    try {
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [RIKEN_SERVICE_UUID]
        });
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(RIKEN_SERVICE_UUID);
        
        writeCharacteristic = await service.getCharacteristic(WRITE_CHAR_UUID);
        notifyCharacteristic = await service.getCharacteristic(NOTIFY_CHAR_UUID);

        await notifyCharacteristic.startNotifications();
        notifyCharacteristic.addEventListener('characteristicvaluechanged', (e) => {
            const val = new TextDecoder().decode(e.target.value);
            console.log("收到儀器回應:", val);
            document.getElementById('gas-display').innerText = "儀器回應: " + val;
        });

        document.getElementById('status').innerText = "連線成功，準備傳送指令...";
        setTimeout(sendCorrectedCommand, 1000); // 連線後延遲 1 秒送出

    } catch (e) {
        document.getElementById('status').innerText = "連線失敗: " + e.message;
    }
}
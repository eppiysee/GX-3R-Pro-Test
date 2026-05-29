const RIKEN_SERVICE_UUID = '5699d362-0c53-11e7-93ae-92361f002671';
const WRITE_CHAR_UUID    = '5699d772-0c53-11e7-93ae-92361f002671';
const NOTIFY_CHAR_UUID   = '5699d646-0c53-11e7-93ae-92361f002671';

let writeChar, notifyChar;

async function connectToRiken() {
    try {
        const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [RIKEN_SERVICE_UUID] }] });
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(RIKEN_SERVICE_UUID);
        writeChar = await service.getCharacteristic(WRITE_CHAR_UUID);
        notifyChar = await service.getCharacteristic(NOTIFY_CHAR_UUID);

        await notifyChar.startNotifications();
        notifyChar.oncharacteristicvaluechanged = (e) => {
            const raw = new TextDecoder().decode(e.target.value);
            document.getElementById('gas-display').innerHTML = `<h3>數據: ${raw}</h3>`;
        };
        
        document.getElementById('status').innerText = "已連線，發送請求中...";
        setInterval(sendCommand, 2000);
    } catch (e) {
        document.getElementById('status').innerText = "失敗: " + e.message;
    }
}

async function sendCommand() {
    // 嘗試使用不同指令組合以避開 F1 錯誤
    const cmd = "0000GD,R"; 
    const encoder = new TextEncoder();
    const data = encoder.encode(cmd);
    const packet = new Uint8Array(data.length + 4);
    packet[0] = 0x02; // STX
    packet.set(data, 1);
    packet[data.length + 1] = 0x03; // ETX
    packet[data.length + 2] = 0x41; // 簡易校驗碼範例
    packet[data.length + 3] = 0x04; // EOT
    await writeChar.writeValue(packet);
}
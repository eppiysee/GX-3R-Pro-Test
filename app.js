// ==========================================
// 終極穩定版 app.js (徹底排除緩衝干擾)
// ==========================================

const RIKEN_SERVICE_UUID = '5699d362-0c53-11e7-93ae-92361f002671';
const WRITE_CHAR_UUID    = '5699d772-0c53-11e7-93ae-92361f002671'; 
const NOTIFY_CHAR_UUID   = '5699d646-0c53-11e7-93ae-92361f002671'; 

let gattServer;
let writeCharacteristic;
let notifyCharacteristic;
let pollingTimer;

async function connectToRiken() {
    const statusDiv = document.getElementById('status');
    try {
        statusDiv.innerText = "請先重啟儀器並配對...";
        
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [RIKEN_SERVICE_UUID]
        });

        gattServer = await device.gatt.connect();
        const service = await gattServer.getPrimaryService(RIKEN_SERVICE_UUID);
        
        writeCharacteristic = await service.getCharacteristic(WRITE_CHAR_UUID);
        notifyCharacteristic = await service.getCharacteristic(NOTIFY_CHAR_UUID);

        await notifyCharacteristic.startNotifications();
        notifyCharacteristic.addEventListener('characteristicvaluechanged', handleDataReceived);
        
        statusDiv.innerText = "已連線，準備發送指令...";
        
        // 【核心】在這裡強制等待 3 秒，給儀器完全冷靜下來的時間
        setTimeout(async () => {
            sendStableCommand();
        }, 3000);

    } catch (error) {
        statusDiv.innerText = "錯誤: " + error.message;
    }
}

async function sendStableCommand() {
    // 使用最標準的 Hex 指令
    const cmd = new Uint8Array([0x02, 0x30, 0x30, 0x30, 0x30, 0x44, 0x48, 0x2C, 0x52, 0x2C, 0x03, 0x41, 0x38, 0x04]);
    
    try {
        await writeCharacteristic.writeValue(cmd);
        document.getElementById('status').innerText = "指令已送出，等待儀器回應...";
    } catch (e) {
        console.error(e);
    }
}

function handleDataReceived(event) {
    const chunk = new TextDecoder('utf-8').decode(event.target.value);
    document.getElementById('gas-display').innerText = "收到片段: " + chunk;
    console.log("底層原始回傳:", chunk);
}
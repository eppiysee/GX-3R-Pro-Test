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
    // 嘗試使用最基礎的 16 進位查詢指令
    // 這是一個極簡封包，沒有複雜字串，直接測試硬體反應
    const cmd = new Uint8Array([0x02, 0x47, 0x45, 0x54, 0x03]); // 試圖詢問狀態
    
    try {
        await writeCharacteristic.writeValue(cmd);
        console.log("已發送基礎查詢指令");
    } catch (e) {
        console.error("寫入失敗:", e);
    }
}

function handleDataReceived(event) {
    const chunk = new TextDecoder('utf-8').decode(event.target.value);
    document.getElementById('gas-display').innerText = "收到片段: " + chunk;
    console.log("底層原始回傳:", chunk);
}
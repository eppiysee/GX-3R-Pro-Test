// 定義理研儀器的特徵值 UUID (小寫)
const RIKEN_SERVICE_UUID = '5699d362-0c53-11e7-93ae-92361f002671';
const WRITE_CHAR_UUID    = '5699d772-0c53-11e7-93ae-92361f002671'; // 772 寫入
const NOTIFY_CHAR_UUID   = '5699d646-0c53-11e7-93ae-92361f002671'; // 646 讀取

let gattServer;
let writeCharacteristic;
let notifyCharacteristic;
let responseBuffer = "";

async function connectToRiken() {
    try {
        // 1. 請求藍牙裝置（過濾理研的 Service UUID）
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [RIKEN_SERVICE_UUID] }]
        });

        // 2. 連線到 GATT 伺服器
        gattServer = await device.gatt.connect();
        
        // 3. 取得 Service
        const service = await gattServer.getPrimaryService(RIKEN_SERVICE_UUID);

        // 4. 取得寫入與讀取的 Characteristic
        writeCharacteristic = await service.getCharacteristic(WRITE_CHAR_UUID);
        notifyCharacteristic = await service.getCharacteristic(NOTIFY_CHAR_UUID);

        // 5. 開啟 646 監聽 (Notify)
        await notifyCharacteristic.startNotifications();
        notifyCharacteristic.addEventListener('characteristicvaluechanged', handleDataReceived);
        
        console.log("藍牙連線成功，監聽已開啟！");
        
        // 6. 啟動定時敲門機制（例如每 2 秒要資料）
        setInterval(sendRikenCommand, 2000);

    } catch (error) {
        console.error("連線失敗：", error);
    }
}

// 6. 定時發送密碼指令（戳一下，才會回一下）
async function sendRikenCommand() {
    if (!writeCharacteristic) return;
    
    // 你在 LightBlue 測試成功的 14 位元組標準 HEX 密碼
    const command = new Uint8Array([
        0x02, 0x30, 0x30, 0x30, 0x30, 0x44, 0x48, 0x2C, 0x52, 0x2C, 0x03, 0x41, 0x38, 0x04
    ]);
    
    try {
        await writeCharacteristic.writeValue(command);
    } catch (error) {
        console.error("發送指令失敗：", error);
    }
}

// 7. 接收並拼接斷包資料，轉成文字
function handleDataReceived(event) {
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    const chunk = decoder.decode(value);
    
    responseBuffer += chunk; // 拼接資料
    
    // 當收到的字串包含結束符號（\x03 或出現逗號數量符合預期）
    if (responseBuffer.includes('\x03') || responseBuffer.length > 50) {
        console.log("收到完整明碼：", responseBuffer);
        
        // 【在這裡解析字串並更新到網頁 UI 上】
        // 例如用 split(',') 切開字串，抓出 "+ 20.9" 顯示在網頁上
        
        responseBuffer = ""; // 清空緩衝區給下一次使用
    }
}
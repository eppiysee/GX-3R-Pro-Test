// UUID 設定
const GDX_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const GDX_CHAR_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

let writeCharacteristic = null;

// =========================================
// 建立 BLE 連線與初始化
// =========================================
async function connectToDevice() {
    try {
        console.log("請求連接裝置...");
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'GX-3R' }], // 搜尋名稱前綴
            optionalServices: [GDX_SERVICE_UUID]
        });

        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(GDX_SERVICE_UUID);
        writeCharacteristic = await service.getCharacteristic(GDX_CHAR_UUID);

        // 開啟通知 (這步最重要，否則收不到數據)
        await writeCharacteristic.startNotifications();
        writeCharacteristic.addEventListener('characteristicvaluechanged', handleNotification);
        
        document.getElementById('status').innerText = "連線成功！";
        console.log("裝置已連線，準備讀取數據");
    } catch (err) {
        console.error("連線錯誤:", err);
        document.getElementById('status').innerText = "連線失敗: " + err.message;
    }
}

// =========================================
// 處理藍牙回傳數據 (修改版)
// =========================================
function handleNotification(event) {
    const value = event.target.value;
    const raw = new TextDecoder().decode(value);
    console.log("收到數據:", raw);
    
    // 解析數據邏輯 (根據規格書調整)
    if (raw.includes("DH,R")) {
        const p = raw.split(',');
        if (p.length >= 7) {
            document.getElementById('CH4').innerText = p[3];
            document.getElementById('O2').innerText = p[4];
            document.getElementById('CO').innerText = p[5];
            document.getElementById('H2S').innerText = p[6];
        }
    }
}

// =========================================
// 觸發連線的按鈕事件
// =========================================
document.getElementById('connectBtn').addEventListener('click', connectToDevice);

// =========================================
// 發送 DH 指令 (保持您原有的邏輯)
// =========================================
async function requestDH() {
    if (!writeCharacteristic) return;
    try {
        const command = "0000DH,R\r"; // 注意：規格書通常要求結尾加上 \r 或 \n
        const encoder = new TextEncoder();
        await writeCharacteristic.writeValue(encoder.encode(command));
    } catch (err) {
        console.error("發送失敗:", err);
    }
}
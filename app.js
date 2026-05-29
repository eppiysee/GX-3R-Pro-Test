// ==========================================
// 理研 GX-3R Pro 藍牙即時監控 - 完整修正版 app.js
// ==========================================

// 1. 精準校正通道門牌號碼
const RIKEN_SERVICE_UUID = '5699d362-0c53-11e7-93ae-92361f002671';
const WRITE_CHAR_UUID    = '5699d772-0c53-11e7-93ae-92361f002671'; // 寫入通道 (772)
const NOTIFY_CHAR_UUID   = '5699d646-0c53-11e7-93ae-92361f002671'; // 監聽通道 (646)

let gattServer;
let writeCharacteristic;
let notifyCharacteristic;
let pollingTimer;
let responseBuffer = "";
let isWriting = false; // 狀態鎖：防止前後指令撞車

// 輔助功能：讓程式暫停，給工控硬體晶片緩衝時間
const delay = ms => new Promise(res => setTimeout(res, ms));

// 主連線功能
async function connectToRiken() {
    const statusDiv = document.getElementById('status');
    const gasDiv = document.getElementById('gas-display');
    
    try {
        statusDiv.innerText = "正在搜尋理研儀器...";
        statusDiv.style.color = "#666";
        
        // 藍牙搜尋：全開放並預先宣告服務
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [RIKEN_SERVICE_UUID]
        });

        statusDiv.innerText = "正在建立安全連線...";
        console.log("已選擇裝置:", device.name);
        
        // 監聽斷線事件
        device.addEventListener('gattserverdisconnected', onDisconnected);

        // 建立 GATT 連線
        gattServer = await device.gatt.connect();
        statusDiv.innerText = "藍牙已連線！等待硬體緩衝...";
        console.log("GATT 連線成功");
        
        // 【關鍵延遲】給工控藍牙晶片 1.5 秒握手緩衝
        await delay(1500); 

        statusDiv.innerText = "正在讀取理研工控通道...";
        const service = await gattServer.getPrimaryService(RIKEN_SERVICE_UUID);
        
        await delay(500);

        // 取得寫入與監聽特徵值
        writeCharacteristic = await service.getCharacteristic(WRITE_CHAR_UUID);
        notifyCharacteristic = await service.getCharacteristic(NOTIFY_CHAR_UUID);

        // 啟動通知監聽
        statusDiv.innerText = "正在啟動數據監聽...";
        await notifyCharacteristic.startNotifications();
        notifyCharacteristic.addEventListener('characteristicvaluechanged', handleDataReceived);
        
        statusDiv.innerText = "系統上線！開始定時讀取數據...";
        statusDiv.style.color = "green";

        // 啟動定時敲門（每 2 秒發送一次密碼，避免晶片過載）
        if (pollingTimer) clearInterval(pollingTimer);
        pollingTimer = setInterval(sendRikenCommand, 2000);

    } catch (error) {
        console.error("【連線錯誤】", error);
        statusDiv.innerText = "連線失敗原因: " + error.message;
        statusDiv.style.color = "red";
    }
}

// 定時發送密碼指令（精準對齊 LightBlue 歷史紀錄）
async function sendRikenCommand() {
    if (!writeCharacteristic || isWriting) return;
    
    // 嚴格對齊 LightBlue 23-byte 原始 Hex 數據，不多不少，不經由字串轉換避免掉碼
    const exactHexCommand = new Uint8Array([
        0x00, 0x23, 0x30, 0x30, 0x30, 0x30, 0x34, 0x34, 
        0x38, 0x32, 0x43, 0x35, 0x32, 0x32, 0x43, 0x30, 
        0x33, 0x34, 0x31, 0x33, 0x38, 0x30, 0x34
    ]);
    
    try {
        isWriting = true; // 上鎖
        // 使用 WithResponse 強制雙向同步，確保晶片完整收下指令
        await writeCharacteristic.writeValueWithResponse(exactHexCommand);
        console.log("【發送成功】指令已完整寫入 772 通道");
    } catch (error) {
        console.warn("寫入忙碌中或硬體未響應，等待下秒循環重試...", error);
    } finally {
        isWriting = false; // 解鎖
    }
}

// 接收數據與斷包拼接
function handleDataReceived(event) {
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    const chunk = decoder.decode(value);
    
    responseBuffer += chunk; 
    console.log("收到數據片段:", chunk);
    
    // 當抓到工控結尾字元 (\x03) 或長度足夠時，觸發解析
    if (responseBuffer.includes('\x03') || responseBuffer.length > 45) {
        console.log("取得完整明碼，送
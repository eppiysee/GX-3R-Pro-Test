// ==========================================
// 理研 GX-3R Pro 藍牙即時監控 - 終極校正版 app.js
// ==========================================

const RIKEN_SERVICE_UUID = '5699d362-0c53-11e7-93ae-92361f002671';
const WRITE_CHAR_UUID    = '5699d772-0c53-11e7-93ae-92361f002671'; // 寫入通道 (772)
const NOTIFY_CHAR_UUID   = '5699d646-0c53-11e7-93ae-92361f002671'; // 監聽通道 (646)

let gattServer;
let writeCharacteristic;
let notifyCharacteristic;
let pollingTimer;
let responseBuffer = "";
let isWriting = false; 

const delay = ms => new Promise(res => setTimeout(res, ms));

async function connectToRiken() {
    const statusDiv = document.getElementById('status');
    
    try {
        statusDiv.innerText = "正在搜尋理研儀器...";
        statusDiv.style.color = "#666";
        
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [RIKEN_SERVICE_UUID]
        });

        statusDiv.innerText = "正在建立安全連線...";
        device.addEventListener('gattserverdisconnected', onDisconnected);

        gattServer = await device.gatt.connect();
        statusDiv.innerText = "藍牙已連線！等待硬體緩衝...";
        
        await delay(1500); // 給工控藍牙晶片緩衝

        statusDiv.innerText = "正在讀取理研工控通道...";
        const service = await gattServer.getPrimaryService(RIKEN_SERVICE_UUID);
        
        await delay(500);

        writeCharacteristic = await service.getCharacteristic(WRITE_CHAR_UUID);
        notifyCharacteristic = await service.getCharacteristic(NOTIFY_CHAR_UUID);

        statusDiv.innerText = "正在啟動數據監聽...";
        await notifyCharacteristic.startNotifications();
        notifyCharacteristic.addEventListener('characteristicvaluechanged', handleDataReceived);
        
        statusDiv.innerText = "系統上線！開始定時讀取數據...";
        statusDiv.style.color = "green";

        // 將 Polling 時間拉長到 3 秒，確保工控設備能從容回應
        if (pollingTimer) clearInterval(pollingTimer);
        pollingTimer = setInterval(sendRikenCommand, 3000);

    } catch (error) {
        console.error("【連線錯誤】", error);
        statusDiv.innerText = "連線失敗原因: " + error.message;
        statusDiv.style.color = "red";
    }
}

// 【終極校正】發送理研標準二進位 14-byte 密碼控制流
async function sendRikenCommand() {
    if (!writeCharacteristic || isWriting) return;
    
    // 這是理研標準通訊明碼的純二進位 HEX 陣列（STX + 指令 + ETX + 校驗碼）
    // 完全不透過英文字串轉換，直接走底層位元流
    const rikenHexCommand = new Uint8Array([
        0x02, 0x30, 0x30, 0x30, 0x30, 0x44, 0x48, 0x2C, 0x52, 0x2C, 0x03, 0x41, 0x38, 0x04
    ]);
    
    try {
        isWriting = true; 
        await writeCharacteristic.writeValueWithResponse(rikenHexCommand);
        console.log("【發送成功】標準工控 14-byte 指令已砸入 772 通道");
    } catch (error) {
        console.warn("寫入忙碌，等待下個循環自動重試...", error);
    } finally {
        isWriting = false; 
    }
}

// 接收數據與斷包拼接
function handleDataReceived(event) {
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    const chunk = decoder.decode(value);
    
    responseBuffer += chunk; 
    console.log("收到數據片段:", chunk);
    
    // 當抓到工控結尾字元 (\x03) 或長度大於 40 時觸發解析
    if (responseBuffer.includes('\x03') || responseBuffer.length > 40) {
        console.log("取得完整數據包，送入解析。");
        parseGasData(responseBuffer);
        responseBuffer = ""; 
    }
}

// 地毯式搜索解析
function parseGasData(rawData) {
    const gasDiv = document.getElementById('gas-display');
    
    try {
        // 清理掉不可見的控制字元
        const cleanData = rawData.replace(/\x02|\x03|\x04/g, '').trim();
        const dataArray = cleanData.split(',');
        
        let debugItemsHtml = "";
        dataArray.forEach((item, index) => {
            debugItemsHtml += `<b style="color:#0078d7;">[欄位 ${index}]:</b> ${item.trim()} <br>`;
        });

        gasDiv.innerHTML = `
            <div style="font-size: 1.1rem; font-weight: bold; color: green; margin-bottom: 10px;">
                📡 藍牙數據接收成功！
            </div>
            <div style="text-align: left; background: #eef5fc; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 0.9rem; max-height: 200px; overflow-y: auto;">
                ${debugItemsHtml}
            </div>
            <div style="margin-top: 10px; font-size: 0.8rem; color: #999; word-break: break-all;">
                原始字串: ${cleanData}
            </div>
        `;

    } catch (err) {
        console.error("解析渲染錯誤：", err);
    }
}

function onDisconnected() {
    if (pollingTimer) clearInterval(pollingTimer);
    document.getElementById('status').innerText = "連線已中斷";
    document.getElementById('status').style.color = "#666";
}

function disconnectDevice() {
    if (gattServer && gattServer.connected) gattServer.disconnect();
}
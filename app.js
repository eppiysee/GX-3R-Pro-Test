// ==========================================
// 理研 GX-3R Pro 藍牙即時監控 - 終極交叉除錯版 app.js
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

// 測試模式計數器
let tryCount = 0;

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
        await delay(1500); 

        statusDiv.innerText = "正在讀取理研工控通道...";
        const service = await gattServer.getPrimaryService(RIKEN_SERVICE_UUID);
        await delay(500);

        writeCharacteristic = await service.getCharacteristic(WRITE_CHAR_UUID);
        notifyCharacteristic = await service.getCharacteristic(NOTIFY_CHAR_UUID);

        statusDiv.innerText = "正在啟動數據監聽...";
        await notifyCharacteristic.startNotifications();
        notifyCharacteristic.addEventListener('characteristicvaluechanged', handleDataReceived);
        
        statusDiv.innerText = "系統上線！開始交叉測試敲門指令...";
        statusDiv.style.color = "green";

        // 每 2.5 秒輪流更換發送策略測試
        if (pollingTimer) clearInterval(pollingTimer);
        pollingTimer = setInterval(sendRikenCommandCrossTest, 2500);

    } catch (error) {
        console.error("【連線錯誤】", error);
        statusDiv.innerText = "連線失敗原因: " + error.message;
        statusDiv.style.color = "red";
    }
}

// 【交叉除錯核心】測試大端序/小端序 與 有無回應寫入
async function sendRikenCommandCrossTest() {
    if (!writeCharacteristic || isWriting) return;
    
    try {
        isWriting = true;
        tryCount++;
        
        // 方案 A：LightBlue 原始順序 (00 23 ...)
        const cmdNormal = new Uint8Array([
            0x00, 0x23, 0x30, 0x30, 0x30, 0x30, 0x34, 0x34, 
            0x38, 0x32, 0x43, 0x35, 0x32, 0x32, 0x43, 0x30, 
            0x33, 0x34, 0x31, 0x33, 0x38, 0x30, 0x34
        ]);

        // 方案 B：開頭端序翻轉 (23 00 ...) 防止瀏覽器在底層幫你自動對調
        const cmdFlipped = new Uint8Array([
            0x23, 0x00, 0x30, 0x30, 0x30, 0x30, 0x34, 0x34, 
            0x38, 0x32, 0x43, 0x35, 0x32, 0x32, 0x43, 0x30, 
            0x33, 0x34, 0x31, 0x33, 0x38, 0x30, 0x34
        ]);

        const mode = tryCount % 4;
        const debugLabel = document.getElementById('status');

        if (mode === 1) {
            debugLabel.innerText = "⚡ 測試模式 1：原始順序 + 帶回應寫入";
            await writeCharacteristic.writeValueWithResponse(cmdNormal);
        } else if (mode === 2) {
            debugLabel.innerText = "⚡ 測試模式 2：原始順序 + 無回應寫入";
            await writeCharacteristic.writeValueWithoutResponse(cmdNormal);
        } else if (mode === 3) {
            debugLabel.innerText = "⚡ 測試模式 3：端序翻轉 + 帶回應寫入";
            await writeCharacteristic.writeValueWithResponse(cmdFlipped);
        } else {
            debugLabel.innerText = "⚡ 測試模式 4：端序翻轉 + 無回應寫入";
            await writeCharacteristic.writeValueWithoutResponse(cmdFlipped);
        }

    } catch (error) {
        console.warn("本次寫入嘗試失敗:", error);
    } finally {
        isWriting = false; 
    }
}

function handleDataReceived(event) {
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    const chunk = decoder.decode(value);
    
    responseBuffer += chunk; 
    
    if (responseBuffer.includes('\x03') || responseBuffer.length > 40) {
        parseGasData(responseBuffer);
        responseBuffer = ""; 
    }
}

function parseGasData(rawData) {
    const gasDiv = document.getElementById('gas-display');
    try {
        const cleanData = rawData.replace(/\x02|\x03|\x04/g, '').trim();
        const dataArray = cleanData.split(',');
        
        // 如果成功打破 F0 大魔王，字串長度必定會變長
        if (dataArray.length > 3) {
            // 成功撈到完整資料，停止測試定時器，改為鎖定成功模式的高頻 Polling
            clearInterval(pollingTimer);
            document.getElementById('status').innerText = "🎉 密碼破解成功！數值已鎖定。";
            document.getElementById('status').style.color = "green";
        }

        let debugItemsHtml = "";
        dataArray.forEach((item, index) => {
            debugItemsHtml += `<b style="color:#0078d7;">[欄位 ${index}]:</b> ${item.trim()} <br>`;
        });

        gasDiv.innerHTML = `
            <div style="font-size: 1.1rem; font-weight: bold; color: green; margin-bottom: 10px;">
                📡 藍牙數據接收中（尋找正確通訊協定）...
            </div>
            <div style="text-align: left; background: #eef5fc; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 0.9rem; max-height: 200px; overflow-y: auto;">
                ${debugItemsHtml}
            </div>
            <div style="margin-top: 10px; font-size: 0.8rem; color: #999; word-break: break-all;">
                原始字串: ${cleanData}
            </div>
        `;
    } catch (err) {
        console.error(err);
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
// 1. 校正回歸！門牌號碼換回一開始正確的 772 與 646
const RIKEN_SERVICE_UUID = '5699d362-0c53-11e7-93ae-92361f002671';
const WRITE_CHAR_UUID    = '5699d772-0c53-11e7-93ae-92361f002671'; // 換回 772
const NOTIFY_CHAR_UUID   = '5699d646-0c53-11e7-93ae-92361f002671'; // 換回 646

let gattServer;
let writeCharacteristic;
let notifyCharacteristic;
let pollingTimer;
let responseBuffer = "";
let isWriting = false; // 新增狀態鎖，防止重複寫入撞車

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
        
        await delay(1500); // 延長緩衝時間，給工控藍牙晶片準備

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

        // 2. 將 Polling 時間拉長到 2 秒，避免工控設備來不及反應
        if (pollingTimer) clearInterval(pollingTimer);
        pollingTimer = setInterval(sendRikenCommand, 2000);

    } catch (error) {
        console.error("【連線錯誤】", error);
        statusDiv.innerText = "連線失敗原因: " + error.message;
        statusDiv.style.color = "red";
    }
}

// 3. 改用最穩定的「帶有回應的寫入」，確保密碼百分之百砸進去
// 徹底對齊 LightBlue 歷史紀錄的終極發送函式
async function sendRikenCommand() {
    if (!writeCharacteristic || isWriting) return;
    
    // 這是完全複製自你 LightBlue 發送成功的 23 位元組 16 進位原始數據 (0x00233030...)
    const exactHexCommand = new Uint8Array([
        0x00, 0x23, 0x30, 0x30, 0x30, 0x30, 0x34, 0x34, 
        0x38, 0x32, 0x43, 0x35, 0x32, 0x32, 0x43, 0x30, 
        0x33, 0x34, 0x31, 0x33, 0x38, 0x30, 0x34
    ]);
    
    try {
        isWriting = true; // 上鎖
        
        // 帶回應寫入，確保晶片完整收下這 23 個 Byte
        await writeCharacteristic.writeValueWithResponse(exactHexCommand);
        console.log("【硬體密碼砸入成功】已送出 LightBlue 同款 Hex 陣列！");
        
    } catch (error) {
        console.warn("寫入指令忙碌中，等待下秒循環自動重試:", error);
    } finally {
        isWriting = false; // 解鎖
    }
}

// 4. 接收與斷包拼接
function handleDataReceived(event) {
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    const chunk = decoder.decode(value);
    
    responseBuffer += chunk; 
    console.log("接收到資料片段:", chunk);
    
    if (responseBuffer.includes('\x03') || responseBuffer.length > 50) {
        console.log("拿到完整明碼，啟動 UI 更新！");
        parseGasData(responseBuffer);
        responseBuffer = ""; 
    }
}

// 5. 暴力除錯解析：把收到的任何東西都攤開在畫面上
function parseGasData(rawData) {
    const gasDiv = document.getElementById('gas-display');
    try {
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
            <div style="text-align: left; background: #eef5fc; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 0.9rem; max-height: 150px; overflow-y: auto;">
                ${debugItemsHtml}
            </div>
            <div style="margin-top: 10px; font-size: 0.8rem; color: #999; word-break: break-all;">
                原始全字串: ${cleanData}
            </div>
        `;
    } catch (err) {
        console.error("解析錯誤：", err);
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
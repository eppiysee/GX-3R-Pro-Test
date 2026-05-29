const RIKEN_SERVICE_UUID = '5699d362-0c53-11e7-93ae-92361f002671';
const WRITE_CHAR_UUID    = '5699d772-0c53-11e7-93ae-92361f002671';
const NOTIFY_CHAR_UUID   = '5699d646-0c53-11e7-93ae-92361f002671';

let gattServer;
let writeCharacteristic;
let notifyCharacteristic;
let pollingTimer;
let responseBuffer = "";

// 輔助函式：讓程式碼暫停幾毫秒，給硬體緩衝時間
const delay = ms => new Promise(res => setTimeout(res, ms));

async function connectToRiken() {
    const statusDiv = document.getElementById('status');
    const gasDiv = document.getElementById('gas-display');
    
    try {
        statusDiv.innerText = "正在搜尋理研儀器...";
        statusDiv.style.color = "#666";
        
        // 1. 全開放搜尋 + 預先申報 Service
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [RIKEN_SERVICE_UUID]
        });

        statusDiv.innerText = "裝置已選擇，正在建立安全連線...";
        console.log("Device selected:", device.name);
        
        // 監聽主動斷線事件
        device.addEventListener('gattserverdisconnected', onDisconnected);

        // 2. 建立 GATT 連線
        gattServer = await device.gatt.connect();
        statusDiv.innerText = "藍牙已連線！正在等待硬體初始化...";
        console.log("GATT Connected");
        
        // 【核心優化】連線成功後，強制暫停 1.5 秒，等藍牙晶片握手完成再要 Service
        await delay(1500); 

        statusDiv.innerText = "正在讀取理研工控通道...";
        console.log("Getting Primary Service...");
        const service = await gattServer.getPrimaryService(RIKEN_SERVICE_UUID);
        
        await delay(500); // 稍微緩衝

        console.log("Getting Characteristics...");
        writeCharacteristic = await service.getCharacteristic(WRITE_CHAR_UUID);
        notifyCharacteristic = await service.getCharacteristic(NOTIFY_CHAR_UUID);

        // 3. 開啟監聽
        statusDiv.innerText = "正在啟動數據監聽...";
        await notifyCharacteristic.startNotifications();
        notifyCharacteristic.addEventListener('characteristicvaluechanged', handleDataReceived);
        
        statusDiv.innerText = "系統上線！開始定時讀取數據...";
        statusDiv.style.color = "green";

        // 4. 啟動定時敲門（每 1 秒戳一次）
        if (pollingTimer) clearInterval(pollingTimer);
        pollingTimer = setInterval(sendRikenCommand, 1000);

    } catch (error) {
        console.error("【連線錯誤】", error);
        statusDiv.innerText = "連線失敗原因: " + error.message;
        statusDiv.style.color = "red";
    }
}

// 定時發送 HEX 密碼
async function sendRikenCommand() {
    if (!writeCharacteristic) return;
    const command = new Uint8Array([
        0x02, 0x30, 0x30, 0x30, 0x30, 0x44, 0x48, 0x2C, 0x52, 0x2C, 0x03, 0x41, 0x38, 0x04
    ]);
    try {
        await writeCharacteristic.writeValueWithoutResponse(command);
    } catch (error) {
        console.warn("發送指令失敗（可能硬體忙碌中）:", error);
    }
}

// 接收與斷包拼接
function handleDataReceived(event) {
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    const chunk = decoder.decode(value);
    
    responseBuffer += chunk; 
    
    if (responseBuffer.includes('\x03') || responseBuffer.length > 55) {
        console.log("收到完整明碼：", responseBuffer);
        parseGasData(responseBuffer);
        responseBuffer = ""; 
    }
}

// 解析字串並動態更新 UI
function parseGasData(rawData) {
    const gasDiv = document.getElementById('gas-display');
    try {
        const dataArray = rawData.split(',');
        if (dataArray.length >= 9) {
            // 清理空白字元
            const oxygenStr = dataArray[8] ? dataArray[8].trim() : "N/A"; 
            
            gasDiv.innerHTML = `
                <div style="font-size: 1.2rem; color: #555;">即時環境數據：</div>
                <div style="font-size: 3.5rem; font-weight: bold; color: #0078d7; margin: 10px 0;">
                    O₂: ${oxygenStr} %
                </div>
                <div style="font-size: 0.85rem; color: #999; word-break: break-all;">
                    Log: ${rawData.replace(/\x02|\x03|\x04/g, '')}
                </div>
            `;
        }
    } catch (err) {
        console.error("解析錯誤：", err);
    }
}

// 斷線觸發
function onDisconnected(event) {
    const device = event.target;
    console.log(`Device ${device.name} is disconnected.`);
    if (pollingTimer) clearInterval(pollingTimer);
    document.getElementById('status').innerText = "連線已中斷，請重新連線";
    document.getElementById('status').style.color = "#666";
}

function disconnectDevice() {
    if (gattServer && gattServer.connected) {
        gattServer.disconnect();
    }
}
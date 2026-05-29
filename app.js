async function sendCorrectedCommand() {
    if (!writeCharacteristic) return;

    // 依據手冊 P.31 規範，指令結構：STX(0x02) + 數據 + ETX(0x03) + SUM + EOT(0x04)
    // 我們將 SUM 計算簡化為固定字串測試
    const data = "0000DH,R"; // 讀取數據指令
    const STX = 0x02;
    const ETX = 0x03;
    const EOT = 0x04;
    
    // 計算 SUM (0x02 到 0x03 之間所有 ASCII 的總和)
    let sumVal = STX + ETX;
    for (let i = 0; i < data.length; i++) sumVal += data.charCodeAt(i);
    const sumHex = (sumVal & 0xFF).toString(16).toUpperCase().padStart(2, '0');

    // 組裝封包: [02] [數據] [03] [SUM1] [SUM2] [04]
    const encoder = new TextEncoder();
    const dataArr = encoder.encode(data);
    const sumArr = encoder.encode(sumHex);
    
    const packet = new Uint8Array(1 + dataArr.length + 1 + sumArr.length + 1);
    packet[0] = STX;
    packet.set(dataArr, 1);
    packet[1 + dataArr.length] = ETX;
    packet.set(sumArr, 1 + dataArr.length + 1);
    packet[packet.length - 1] = EOT;

    // 發送並確保緩衝刷新
    await writeCharacteristic.writeValue(packet);
    console.log("已觸發手冊標準封包:", packet);
}

// 確保連線時啟動通知
async function connectToRiken() {
    try {
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ services: ['5699d362-0c53-11e7-93ae-92361f002671'] }]
        });
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService('5699d362-0c53-11e7-93ae-92361f002671');
        
        writeCharacteristic = await service.getCharacteristic('5699d772-0c53-11e7-93ae-92361f002671');
        const notifyChar = await service.getCharacteristic('5699d646-0c53-11e7-93ae-92361f002671');

        await notifyChar.startNotifications();
        notifyChar.oncharacteristicvaluechanged = (e) => {
            const raw = new TextDecoder().decode(e.target.value);
            document.getElementById('gas-display').innerText = "儀器回傳: " + raw;
        };

        document.getElementById('status').innerText = "連線成功，正在喚醒儀器...";
        // 連線後每 2 秒嘗試一次
        setInterval(sendCorrectedCommand, 2000);
    } catch (e) {
        document.getElementById('status').innerText = "錯誤: " + e.message;
    }
}
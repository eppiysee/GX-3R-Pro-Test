// =========================================
// 修正後的 Checksum 計算 (僅累加，不取補數)
// =========================================
function calculateCheckSum(dataString) {
    let sum = 0x02; // STX
    for (let i = 0; i < dataString.length; i++) {
        sum += dataString.charCodeAt(i);
    }
    sum += 0x03; // ETX
    // 規格書要求：取總和的低位元組 (後兩位 Hex)
    return (sum & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

// =========================================
// 建立符合規格的 BLE 封包
// =========================================
function buildPacket(command) {
    const checksum = calculateCheckSum(command);
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(command);
    const sumBytes = encoder.encode(checksum);

    // 封包: STX(1) + DATA(N) + ETX(1) + SUM(2) + EOT(1)
    const packet = new Uint8Array(1 + dataBytes.length + 1 + 2 + 1);
    packet[0] = 0x02;
    packet.set(dataBytes, 1);
    packet[1 + dataBytes.length] = 0x03;
    packet.set(sumBytes, 1 + dataBytes.length + 1);
    packet[packet.length - 1] = 0x04;
    return packet;
}

// =========================================
// 發送 DH 指令
// =========================================
async function requestDH() {
    if (!writeCharacteristic) return;
    try {
        const command = "0000DH,R"; // 讀取氣體與狀態
        const packet = buildPacket(command);
        console.log("發送 DH 請求:", packet);
        await writeCharacteristic.writeValue(packet);
    } catch (err) {
        console.error("發送失敗:", err);
    }
}
// =======================
// 修正後的 Checksum 計算
// =======================
function calculateCheckSum(dataString) {
    let sum = 0x02; // STX
    for (let i = 0; i < dataString.length; i++) {
        sum += dataString.charCodeAt(i);
    }
    sum += 0x03; // ETX
    
    // 關鍵修正：直接轉 Hex，不要做 2's complement
    return (sum & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

// =======================
// 建立符合規格的 BLE 封包
// =======================
function buildPacket(command) {
    const checksum = calculateCheckSum(command);
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(command);
    const sumBytes = encoder.encode(checksum);

    const packet = new Uint8Array(1 + dataBytes.length + 1 + 2 + 1);
    packet[0] = 0x02;                           // STX
    packet.set(dataBytes, 1);                  // DATA
    packet[1 + dataBytes.length] = 0x03;       // ETX
    packet.set(sumBytes, 1 + dataBytes.length + 1); // SUM
    packet[packet.length - 1] = 0x04;          // EOT
    return packet;
}

// =======================
// 核心讀取指令 (DH,R)
// =======================
async function requestDH() {
    if (!writeCharacteristic) return;
    try {
        // 規格書定義格式: 0000DH,R
        const command = "0000DH,R"; 
        const packet = buildPacket(command);
        await writeCharacteristic.writeValue(packet);
        console.log("已發送 DH 讀取指令");
    } catch (err) {
        console.error("發送失敗:", err);
    }
}
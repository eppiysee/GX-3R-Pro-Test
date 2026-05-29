// 1. 定義符合規格的 Checksum 計算函數
function calculateCheckSum(dataString) {
    // 將 STX(0x02) 後到 ETX(0x03) 前的所有 ASCII 字元加總
    let sum = 0x02; // STX
    for (let i = 0; i < dataString.length; i++) {
        sum += dataString.charCodeAt(i);
    }
    sum += 0x03; // ETX
    // 取總和的後兩位 Hex 並轉為大寫字串
    return (sum & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

// 2. 建構正確的封包
async function sendCommand() {
    if (!writeCharacteristic) return;

    // 指令格式: Address(00) + Channel(00) + Command(DH) + Subcommand(R)
    // 總字串: "0000DH,R"
    const cmdStr = "0000DH,R";
    const sumHex = calculateCheckSum(cmdStr);
    
    // 建構 Array: STX + DATA + ETX + SUM + EOT
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(cmdStr);
    const sumBytes = encoder.encode(sumHex);
    
    const packet = new Uint8Array(1 + dataBytes.length + 1 + 2 + 1);
    packet[0] = 0x02; // STX
    packet.set(dataBytes, 1);
    packet[1 + dataBytes.length] = 0x03; // ETX
    packet.set(sumBytes, 1 + dataBytes.length + 1);
    packet[packet.length - 1] = 0x04; // EOT

    await writeCharacteristic.writeValue(packet);
}
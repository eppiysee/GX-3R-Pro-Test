// =======================
// Checksum 計算
// =======================

function calculateCheckSum(dataString) {

    let sum = 0x02;

    for (let i = 0; i < dataString.length; i++) {
        sum += dataString.charCodeAt(i);
    }

    sum += 0x03;

    return (sum & 0xFF)
        .toString(16)
        .toUpperCase()
        .padStart(2, '0');
}


// =======================
// 建立 BLE 封包
// =======================

function buildPacket(command) {

    const checksum = calculateCheckSum(command);

    const encoder = new TextEncoder();

    const dataBytes = encoder.encode(command);
    const sumBytes = encoder.encode(checksum);

    const packet = new Uint8Array(
        1 + dataBytes.length + 1 + 2 + 1
    );

    // STX
    packet[0] = 0x02;

    // DATA
    packet.set(dataBytes, 1);

    // ETX
    packet[1 + dataBytes.length] = 0x03;

    // SUM
    packet.set(
        sumBytes,
        1 + dataBytes.length + 1
    );

    // EOT
    packet[packet.length - 1] = 0x04;

    return packet;
}


// =======================
// 發送 DH 指令
// =======================

async function sendDH(writeCharacteristic) {

    if (!writeCharacteristic) return;

    try {

        // 注意最後的 ,
        const command = "0000DH,R,";

        const packet = buildPacket(command);

        console.log("SEND DH:", packet);

        await writeCharacteristic.writeValueWithoutResponse(packet);

    } catch (err) {

        console.error(err);

    }
}


// =======================
// 發送 RC 測試指令
// =======================

async function sendRC(writeCharacteristic) {

    if (!writeCharacteristic) return;

    try {

        const command = "0000RC,R,";

        const packet = buildPacket(command);

        console.log("SEND RC:", packet);

        await writeCharacteristic.writeValueWithoutResponse(packet);

    } catch (err) {

        console.error(err);

    }
}
const dgram = require('dgram');
const net = require('net');
const { Transform } = require('stream');
const path = require('path');

const port = process.argv[2]
const chunkSize = Number(process.argv[4]) || 1200;
const porterr = !port || isNaN(port) || port < 1 || port > 65535 
if(porterr|| isNaN(chunkSize) || chunkSize < 1 || chunkSize > 65535) {
    if(porterr) console.error("\x1b[31mPort must be between 1 and 65535.\x1b[0m\n");
      console.error(
        "\x1b[33mUsage: \x1b[36mnode " + path.basename(__filename) + " \x1b[33m<port>\x1b[34m <Stun server (not required)> <chunksize (not required)(byte)> <debug (not required)(0 or 1)>\x1b[0m"+
        "\x1b[38;5;214m\n\nExample stun servers:\x1b[0m\n" +
        "\x1b[32mstun.l.google.com:19302\n" +
        "stun.nextcloud.com:3478\n" +
        "global.stun.twilio.com:3478 \x1b[38;5;214m(default)\x1b[0m"
      );

    process.exit(1);
}
const debug = Number(process.argv[5]) === 1 ? 1 : (Number(process.argv[5]) === 0 ? 0 : undefined);

const STUN_HEADER = Buffer.from([
    0x00, 0x01,             // Binding Request
    0x00, 0x00,             // Length = 0
    0x21, 0x12, 0xA4, 0x42, // Magic Cookie
    ...Array.from({ length: 12 }, () => Math.floor(Math.random() * 256)) // Random Transaction ID
]);

class Chunker extends Transform {
    constructor(chunkSize) {
        super();
        this.chunkSize = chunkSize;
        this.buffer = Buffer.alloc(0);
    }
    _transform(chunk, encoding, callback) {
        this.buffer = Buffer.concat([this.buffer, chunk]);

        while (this.buffer.length >= this.chunkSize) {
            this.push(this.buffer.slice(0, this.chunkSize));
            this.buffer = this.buffer.slice(this.chunkSize);
        }
        if (this.buffer.length > 0) {
            this.push(this.buffer);
            this.buffer = Buffer.alloc(0);
        }

        callback();
    }
}
if (debug) console.log("\x1b[33mDebug mode enabled.\x1b[0m");
function encode(protocol, connectionId) {
    const buffer = Buffer.alloc(4);
    const firstByte = ((protocol & 0x03) << 6) | ((connectionId >> 24) & 0x3F);
    buffer.writeUInt8(firstByte, 0);
    buffer.writeUIntBE(connectionId & 0xFFFFFF, 1, 3);
    return buffer;
}

function decode(buffer) {
    const protocol = (buffer.readUInt8(0) >> 6) & 0x03;
    const highBits = (buffer.readUInt8(0) & 0x3F) << 24;
    const lowBits = buffer.readUIntBE(1, 3);
    const connectionId = highBits | lowBits;

    return { protocol, connectionId };
}
const client = dgram.createSocket('udp4');

var connectionsId = 1024;
const connections = new Map();
const waitingClients = {}

client.on('listening', () => {
    console.log('\x1b[33mConnecting Stun server...\x1b[0m');
    const lk = process.argv[3] || 'global.stun.twilio.com:3478';
    client.send(STUN_HEADER, Number(lk.split(":")[1]), lk.split(":")[0]);
});


function sendmsg(newid, remote) {
    const data = waitingClients[newid].shift();
    if (!data) return false;
    const encoded = encode(2, newid);
    client.send(Buffer.concat([encoded, data]), remote.port, remote.address, (err) => { });
    return true;
}


client.once('message', (message, remote) => {
    if (message.length < 20) process.exit(1); 
    let type = message.readUInt16BE(20);
    if (type === 0x0001 || type === 0x0020) {
        let qport = message.readUInt16BE(26) ^ 0x2112;
        let tip = [];
        for (let i = 0; i < 4; i++) {
            tip.push(message[28 + i] ^ message[4 + i]);
        }

        const publicIP = tip.join('.');
        console.log(`\x1b[32mYour IP address: \x1b[38;5;214m${publicIP}:${qport}\x1b[0m`);

    } else process.exit(1); 

    client.on("message", (message, remote) => {
        const { protocol, connectionId } = decode(message);
        if(debug) console.log(Date.now(), `Protocol: ${protocol}, Connection ID: ${connectionId}`);
        // protocols: 0 connection start 🚀, 1 connection end 🔚, 2 data 📡, 3 (ack) feedback ✅
        if (protocol == 0) {
            if(connectionId == 1) return;
            else if (connectionId == 2) {
                const int = setInterval(() => {//keep alive 🔄
                    client.send(encode(0, 1), remote.port, remote.address, (err) => {
                        if (err) {
                            if(debug) console.error('Error sending keep-alive:', err);
                            clearInterval(int);
                        }
                    });
                }, 10000);
                return;
            }
            const newid = connectionsId++;

            if(debug != 0) console.log(Date.now(), "Connected ID: " + newid);
            const serve = net.createConnection({ port: port, host: "localhost" })
            serve.on('connect', () => {
                connections.set(newid, {
                    serve: serve,
                    addr: remote.address,
                    port: remote.port
                });
                waitingClients[newid] = [];
                waitingClients["sending" + newid] = false;
                const encoded = encode(0, connectionId);
                const idBuf = Buffer.alloc(4);
                idBuf.writeUInt32BE(newid);
                client.send(Buffer.concat([encoded, idBuf]), remote.port, remote.address, (err) => { });
            });

            const chunker = new Chunker(chunkSize);
            serve.pipe(chunker).on('data', chunk => {
                waitingClients[newid].push(chunk);
                if (waitingClients["sending" + newid]) return;
                waitingClients["sending" + newid] = true;
                sendmsg(newid, remote);
            });

            var cleaning = false;
            async function cleanup() {
                if (cleaning) return;
                cleaning = true;    
                if(debug) console.log(Date.now(), 'Cleaning up...', newid);
                if (waitingClients["sending" + newid]) {
                    await new Promise(resolve => {
                        var mtry = 0;
                        const interval = setInterval(() => {
                            mtry++;
                            if (mtry > 500) {
                                clearInterval(interval);
                                resolve();
                            }
                            if (!waitingClients["sending" + newid]) {
                                clearInterval(interval);
                                resolve();
                            }
                        }, 10);
                    });
                }
                try { client.send(encode(1, newid), remote.port, remote.address, (err) => { }); } catch { }
                serve.end();
                setTimeout(() => {
                    if (!serve.destroyed) serve.destroy();
                }, 3000);
                connections.delete(newid);
                delete waitingClients[newid];
                delete waitingClients["sending" + newid];
                
                if(debug) console.log(Date.now(), 'Cleanuped..', newid);
            }
            serve.on('error', cleanup);
            serve.on('close', cleanup);
            serve.on("end", cleanup);
            return;
        }
        const connection = connections.get(connectionId);
        if (connection) {
            if (protocol == 1) {

                connection.serve.end(() => {
                    if(debug) console.log(Date.now(), 'Connection closed by cli!');
                });
            } else if (protocol == 2) {

                connection.serve.write(message.slice(4));
                client.send(encode(3, connectionId), remote.port, remote.address, (err) => { });
            } else if (protocol == 3) {

                const res = sendmsg(connectionId, remote);
                if (!res) {
                    waitingClients["sending" + connectionId] = false;
                }
            }
        }
    })
});

client.on('error', (err) => {
    console.error(`Socket err: ${err.message}`);
    client.close();
});
client.bind();

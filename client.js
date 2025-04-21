const dgram = require('dgram');
const net = require('net');
const { Transform } = require('stream');

const path = require('path');
var ip = process.argv[2];
const port = process.argv[3];
const defaultchunksize = 1200;
const chunkSize = Number(process.argv[4]) || defaultchunksize;

const iperr = !ip || ip.split(":").length != 2 || isNaN(ip.split(":")[1]) || ip.split(":")[1] < 1 || ip.split(":")[1] > 65535;
const porterr = !port || isNaN(port) || port < 1 || port > 65535;
if (iperr || porterr || isNaN(chunkSize) || chunkSize < 1 || chunkSize > 65535) {
    if (iperr) console.error("\x1b[31mInvalid IP format or missing IP.\x1b[0m\n");
    if (porterr) console.error("\x1b[31mPort must be between 1 and 65535.\x1b[0m\n");
    console.error(
       "\x1b[33mUsage: \x1b[36mnode " + path.basename(__filename) + " \x1b[33m<ip> <output port>\x1b[34m <chunksize (not required)(byte) default "
       + defaultchunksize +
       "> <debug (not required)(0 or 1)>\x1b[0m" 
    );
    process.exit(1);
}

const debug = Number(process.argv[5]) === 1 ? 1 : (Number(process.argv[6]) === 0 ? 0 : undefined);
const talkport = Number(ip.split(":")[1]);
ip = ip.split(":")[0];

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
    _flush(callback) {
        if (this.buffer.length > 0) {
            this.push(this.buffer);
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

client.on("message", (message, remote) => {
    const { protocol, connectionId } = decode(message);
    const data = message.slice(4);
    if(debug) console.log(Date.now(), `Protocol: ${protocol}, ID: ${connectionId}`);
    if (protocol == 0) {
        if (data.length < 4) return;
        const newId = data.readUInt32BE(0);
        if(debug) console.log(Date.now(), "New ID: " + newId, connectionId);
        const resolver = newClients.get(connectionId);
        if (resolver && typeof resolver === 'function') resolver(newId);
        newClients.delete(connectionId);
    } else if (protocol == 3) {
        const res = sendmsg(connectionId);
        if(debug) console.log(Date.now(), "transferred cli=>server", res, connectionId)
        if (!res) waitingClients["sending" + connectionId] = false;
    } else if (protocol == 2) {
        const socket = Clients.get(connectionId);
        if (socket) {
            socket.write(data);
            client.send(encode(3, connectionId), talkport, ip, (err) => { });
        }
    } else if (protocol == 1) {
        const socket = Clients.get(connectionId);
        if (socket) {
            socket.end(() => {
                if(debug) console.log('Connection closed by server!',connectionId);
            });
        }
    }
})

//keep alive 🔄
client.send(encode(0, 2), talkport, ip, (err) => {})  
const int = setInterval(() => {
    client.send(encode(0, 1), talkport, ip, (err) => {
        if (err)  {
            if(debug) console.error('Error sending keep-alive:', err);
            clearInterval(int);
        }
     });
}, 10000);

const waitingClients = {}
const newClients = new Map()
const Clients = new Map()

function sendmsg(newid) {
    const data = waitingClients[newid].shift();
    if (!data) return false;
    const encoded = encode(2, newid);
    client.send(Buffer.concat([encoded, data]), talkport, ip, (err) => { });
    return true;
}
var newconnectionids = 3;
net.createServer(async (socket) => {
    var id = newconnectionids++;
    if (id > 1023) id = 3, newconnectionids = 4;
    client.send(encode(0, id), talkport, ip, (err) => { });
    id = await new Promise(resolve =>
        newClients.set(id, resolve)
    );

    Clients.set(id, socket);
    if(debug != 0) console.log(Date.now(), "Connected ID: " + id)

    waitingClients[id] = [];
    waitingClients["sending" + id] = false;

    const chunker = new Chunker(chunkSize);
    socket.pipe(chunker).on('data', chunk => {
        waitingClients[id].push(chunk);
        if (waitingClients["sending" + id]) return;
        waitingClients["sending" + id] = true;
        sendmsg(id);
    });

    var cleaning = false;
    async function cleanup() {
        if (cleaning) return;
        cleaning = true;
        if(debug) console.log('Cleaning up...', id);
        if (waitingClients["sending" + id]) {
            await new Promise(resolve => {
                var mtry = 0;
                const interval = setInterval(() => {
                    mtry++;
                    if (mtry > 500) {
                        clearInterval(interval);
                        resolve();
                    }
                    if (!waitingClients["sending" + id]) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 10);
            });
        }


        try { client.send(encode(1, id), talkport, ip, (err) => { }); } catch { }
        if(debug) console.log("Cleanupded", id)
        socket.end();
        setTimeout(() => {
            if (!socket.destroyed) socket.destroy();
        }, 3000);
        Clients.delete(id);
        delete waitingClients[id];
        delete waitingClients["sending" + id];
    }

    socket.on('error', cleanup)
    socket.on('close', cleanup)
    socket.on("end", cleanup);
}).listen(port, () => {
    console.log(`\x1b[32mTCP server is now listening on port \x1b[33m${port}\x1b[32m and exposed to the outside.\x1b[0m`);
});


client.on('error', (err) => {
    if(debug) console.error(`Socket err: ${err.message}`);
    client.close();
});

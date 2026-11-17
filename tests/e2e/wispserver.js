// A real WebSocket WISP relay for tests (node only, no dependencies). page.routeWebSocket does not reach Worker sockets, so the
// libcurl-in-a-Worker tests need a real server. Every CONNECT is sent to 127.0.0.1:<port> whatever the hostname says.
const http = require('http');
const net = require('net');
const crypto = require('crypto');

function frame(buf) {   // server -> client binary frame, unmasked
  const n = buf.length, h = n < 126 ? Buffer.from([0x82, n]) : n < 65536 ? Buffer.from([0x82, 126, n >> 8, n & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x82; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
  return Buffer.concat([h, buf]);
}

function startWisp() {
  const stats = { sockets: 0, connects: 0 };
  const server = http.createServer((_, res) => res.end('wisp'));
  server.on('upgrade', (req, sock) => {
    stats.sockets++;
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
      crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64') + '\r\n' +
      (req.headers['sec-websocket-protocol'] ? 'Sec-WebSocket-Protocol: ' + req.headers['sec-websocket-protocol'].split(',')[0].trim() + '\r\n' : '') + '\r\n');
    const streams = new Map();
    const send = (t, id, p) => { const b = Buffer.alloc(5 + p.length); b[0] = t; b.writeUInt32LE(id, 1); p.copy(b, 5); if (!sock.destroyed) sock.write(frame(b)); };
    const cont = Buffer.alloc(4); cont.writeUInt32LE(1000); send(3, 0, cont);
    const onMsg = (m) => {
      const t = m[0], id = m.readUInt32LE(1), p = m.subarray(5);
      if (t === 1) { stats.connects++; const c = net.connect(p.readUInt16LE(1), '127.0.0.1'); streams.set(id, c); c.on('data', (d) => send(2, id, d)); c.on('close', () => send(4, id, Buffer.from([2]))); c.on('error', () => {}); }
      else if (t === 2) { const c = streams.get(id); if (c) c.write(p); }
      else if (t === 4) { const c = streams.get(id); if (c) c.destroy(); }
    };
    let acc = Buffer.alloc(0);
    sock.on('data', (d) => {
      acc = Buffer.concat([acc, d]);
      for (;;) {
        if (acc.length < 2) return;
        const acc0 = acc[0];
        let len = acc[1] & 127, off = 2;
        if (len === 126) { if (acc.length < 4) return; len = acc.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (acc.length < 10) return; len = Number(acc.readBigUInt64BE(2)); off = 10; }
        const masked = acc[1] & 128;
        if (acc.length < off + (masked ? 4 : 0) + len) return;
        const mask = masked ? acc.subarray(off, off + 4) : null; off += masked ? 4 : 0;
        const payload = Buffer.from(acc.subarray(off, off + len));
        if (mask) for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
        acc = acc.subarray(off + len);
        const op = acc0 & 15;
        if (op === 8) { sock.end(); return; }
        if (op === 2 && payload.length >= 5) onMsg(payload);   // shortcut: no fragmented frames (libcurl sends whole wisp packets)
      }
    });
    sock.on('error', () => {});
    sock.on('close', () => { for (const c of streams.values()) c.destroy(); });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ url: 'ws://127.0.0.1:' + server.address().port + '/', stats, close: () => new Promise((r) => { server.closeAllConnections && server.closeAllConnections(); server.close(r); }) })));
}
module.exports = { startWisp };

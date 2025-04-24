# P2P Connection System / P2P Bağlantı Sistemi

![Demo](https://i.imgur.com/d48HyaQ.gif)

## English

This project enables peer-to-peer (P2P) connections using UDP and TCP protocols. It performs NAT traversal via STUN servers and implements a client-server model for data transfer.

### Features
- **STUN Server Support:** Uses STUN servers for NAT traversal.
- **UDP and TCP Usage:** Establishes connections over UDP and transfers data over TCP.
- **Chunking:** Splits large data blocks into smaller chunks for transmission.

### Usage

#### Server
To start the server, run the following command:
```bash
node server.js <port> <stun_server> <chunk_size> <debug>
```

- `<port>`: The TCP port the server will listen on.
- `<stun_server>`: (Optional) The STUN server to use. Default: `global.stun.twilio.com:3478`.
- `<chunk_size>`: (Optional) The size of data chunks (in bytes). Default: `1200`.
- `<debug>`: (Optional) Debug mode. `1` to enable, `0` to disable.

#### Client
To start the client, run the following command:
```bash
node client.js <ip:port> <output_port> <chunk_size> <debug>
```

- `<ip:port>`: The IP address and port of the server.
- `<output_port>`: The TCP port the client will listen on.
- `<chunk_size>`: (Optional) The size of data chunks (in bytes). Default: `1200`.
- `<debug>`: (Optional) Debug mode. `1` to enable, `0` to disable.

Readme.md file was created by GPT-4o

---

## Türkçe

Bu proje, UDP ve TCP protokollerini kullanarak eşler arası (P2P) bağlantılar kurmayı sağlar. STUN sunucuları aracılığıyla NAT delme işlemi gerçekleştirir ve veri aktarımı için bir istemci-sunucu modeli uygular.

### Özellikler
- **STUN Sunucusu Desteği:** NAT delme işlemi için STUN sunucuları kullanılır.
- **UDP ve TCP Kullanımı:** UDP üzerinden bağlantı kurulurken TCP üzerinden veri aktarımı yapılır.
- **Parçalama (Chunking):** Büyük veri blokları belirli boyutlarda parçalara ayrılarak gönderilir.

### Kullanım

#### Sunucu
Sunucuyu başlatmak için aşağıdaki komutu çalıştırın:
```bash
node server.js <port> <stun_server> <chunk_size> <debug>
```

- `<port>`: Sunucunun dinleyeceği TCP portu.
- `<stun_server>`: (Opsiyonel) Kullanılacak STUN sunucusu. Varsayılan: `global.stun.twilio.com:3478`.
- `<chunk_size>`: (Opsiyonel) Veri parçalarının boyutu (byte). Varsayılan: `1200`.
- `<debug>`: (Opsiyonel) Hata ayıklama modu. `1` etkin, `0` devre dışı.

#### İstemci
İstemciyi başlatmak için aşağıdaki komutu çalıştırın:
```bash
node client.js <ip:port> <output_port> <chunk_size> <debug>
```

- `<ip:port>`: Sunucunun IP adresi ve portu.
- `<output_port>`: İstemcinin dinleyeceği TCP portu.
- `<chunk_size>`: (Opsiyonel) Veri parçalarının boyutu (byte). Varsayılan: `1200`.
- `<debug>`: (Opsiyonel) Hata ayıklama modu. `1` etkin, `0` devre dışı.

Readme.md dosyası GPT-4o tarafından oluşturuldu

# Weighbridge Local Agent (WB-LOCAL-AGENT-1)

Small service that runs **on-site at the mine** next to the weighbridge hardware. It reads weight data (serial port or TCP) and POSTs to the backend ingest API with idempotency and offline retry.

## Status

**Stub / scaffold** — backend ingest API is ready (`POST /api/weighbridge/ingest`). This package needs hardware-specific configuration from the client (model, serial/TCP output, installer).

## Quick start (development)

```powershell
cd apps/weighbridge-agent
copy .env.example .env
npm install
npm start
```

Configure in `.env`:

- `INGEST_URL` — e.g. `https://api.sahman.ir/api/weighbridge/ingest`
- `AGENT_TOKEN` — weighbridge operator API token
- `MINE_ID` — mine workspace id (pilot: `1`)
- `SERIAL_PORT` — e.g. `COM3` on Windows or `/dev/ttyUSB0` on Linux

## Architecture

```
[Scale hardware] → serial/TCP → [this agent] → HTTP POST ingest (+ queue on failure)
                                      ↓
                              [logestic backend]
```

On network failure, events are appended to a local JSON queue (`data/queue.json`) and retried every 30 seconds.

## Deploy (production)

1. Install Node 20 LTS on the mine PC connected to the scale.
2. Copy this folder + `.env` with production credentials.
3. Run as a Windows Service or systemd unit (see `deploy/weighbridge-agent.service.example`).
4. Verify with a test weight → check ticket in web panel.

## Integration test

```powershell
npm run test:mock
```

Sends a mock payload to a local mock ingest server (no hardware required).

## Client deliverables needed

- Scale model and output protocol (serial baud rate, field format, or TCP port)
- Network path from scale PC to API (VPN / fixed IP)
- Operator token for ingest

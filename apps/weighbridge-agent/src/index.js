import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const ingestUrl = process.env.INGEST_URL ?? "";
const agentToken = process.env.AGENT_TOKEN ?? "";
const mineId = Number(process.env.MINE_ID ?? "1");
const retryMs = Number(process.env.RETRY_INTERVAL_MS ?? "30000");
const queuePath = process.env.QUEUE_PATH ?? "./data/queue.json";

function loadQueue() {
  try {
    return JSON.parse(fs.readFileSync(queuePath, "utf8"));
  } catch {
    return [];
  }
}

function saveQueue(items) {
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  fs.writeFileSync(queuePath, JSON.stringify(items, null, 2));
}

async function postIngest(payload) {
  const res = await fetch(ingestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${agentToken}`,
      "Idempotency-Key": payload.idempotency_key,
    },
    body: JSON.stringify(payload.body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ingest ${res.status}: ${text}`);
  }
  return res.json();
}

async function flushQueue() {
  const queue = loadQueue();
  if (queue.length === 0) return;
  const remaining = [];
  for (const item of queue) {
    try {
      await postIngest(item);
      console.log(`[agent] flushed queued event ${item.idempotency_key}`);
    } catch (err) {
      console.error(`[agent] retry failed:`, err);
      remaining.push(item);
    }
  }
  saveQueue(remaining);
}

/** Stub: replace with serial/TCP reader for real hardware. */
export function mockWeightEvent(ticketRef, emptyKg, loadedKg) {
  const idempotency_key = `wb-${ticketRef}-${Date.now()}`;
  return {
    idempotency_key,
    body: {
      mine_id: mineId,
      ticket_ref: ticketRef,
      empty_weight_kg: emptyKg,
      loaded_weight_kg: loadedKg,
      captured_at: new Date().toISOString(),
      source: "local-agent-stub",
    },
  };
}

async function enqueueOrSend(event) {
  try {
    await postIngest(event);
    console.log(`[agent] ingest ok ${event.idempotency_key}`);
  } catch (err) {
    console.error(`[agent] ingest failed, queueing:`, err);
    const queue = loadQueue();
    queue.push(event);
    saveQueue(queue);
  }
}

async function main() {
  if (!ingestUrl || !agentToken) {
    console.error("[agent] set INGEST_URL and AGENT_TOKEN in .env");
    process.exit(1);
  }
  console.log(`[agent] starting — ingest=${ingestUrl} mine=${mineId}`);
  setInterval(flushQueue, retryMs);
  setInterval(() => {
    console.log("[agent] waiting for hardware reader (see README)");
  }, 60_000);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export { enqueueOrSend, postIngest, flushQueue, mockWeightEvent };

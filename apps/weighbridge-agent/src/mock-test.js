import { mockWeightEvent, enqueueOrSend } from "./index.js";

/** Mock integration — no serial hardware. */
const event = mockWeightEvent("demo-ticket-1", 1000, 11000);
await enqueueOrSend(event);
console.log("mock-test: event queued or sent");

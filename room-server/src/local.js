// Local entry: install the FinalizationRegistry stub before Automerge loads.
// Imports evaluate in order, so the stub runs first.
import "./finalization-registry-stub.js";

export { default, Room } from "./index.js";

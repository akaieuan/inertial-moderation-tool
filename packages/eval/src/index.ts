/**
 * @inertial/eval — verification substrate for moderation skills.
 *
 * Three concerns, three modules:
 *  - scoring.ts      — pure math (Brier, ECE, agreement)
 *  - calibration.ts  — pivot raw run predictions into per-(skill, channel) rows
 *  - runner.ts       — feed gold events through a Runciter-shaped evaluator,
 *                      capture predictions, score them
 *
 * Plus two adapters from existing system shapes:
 *  - loader.ts             — JSONL → GoldEvent[] for hand-labeled sets
 *  - reviewer-derived.ts   — ReviewDecision → GoldEvent (auto-promotion)
 */

export * from "./scoring.js";
export * from "./calibration.js";
export * from "./loader.js";
export * from "./reviewer-derived.js";
export * from "./runner.js";

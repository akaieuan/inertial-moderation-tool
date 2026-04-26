import { readFile } from "node:fs/promises";
import { load as loadYaml } from "js-yaml";
import { PolicyDocSchema, type PolicyDoc } from "./dsl.js";

export async function loadPolicyFromFile(path: string): Promise<PolicyDoc> {
  const raw = await readFile(path, "utf8");
  return parsePolicy(raw);
}

export function parsePolicy(yaml: string): PolicyDoc {
  const parsed = loadYaml(yaml);
  const result = PolicyDocSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid policy:\n${issues}`);
  }
  return result.data;
}

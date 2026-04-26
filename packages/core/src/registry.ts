import type { BaseAgent } from "./agent.js";

export class AgentRegistry {
  private readonly agents: BaseAgent[] = [];

  register(agent: BaseAgent): this {
    this.agents.push(agent);
    return this;
  }

  list(): readonly BaseAgent[] {
    return this.agents;
  }
}

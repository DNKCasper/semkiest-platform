import { AgentStatus } from './enums.js';

/** Configuration parameters for an agent */
export interface AgentConfig {
  maxConcurrency: number;
  timeoutMs: number;
  retries: number;
  capabilities: string[];
  environment: Record<string, string>;
}

/** An AI agent that executes test runs */
export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  config: AgentConfig;
  lastHeartbeatAt?: Date;
  currentJobId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Payload for registering a new agent */
export type RegisterAgentInput = Pick<Agent, 'name'> & {
  config: AgentConfig;
};

/** Payload for updating agent status */
export type UpdateAgentStatusInput = {
  status: AgentStatus;
  currentJobId?: string;
};

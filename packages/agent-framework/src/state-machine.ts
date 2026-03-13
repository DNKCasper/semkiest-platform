/**
 * Finite state machine governing agent lifecycle transitions.
 *
 * Only the transitions declared in VALID_TRANSITIONS are permitted.
 * Attempting an invalid transition throws an {@link InvalidTransitionError}.
 */

import { AgentState, VALID_TRANSITIONS } from './types';

/** Thrown when a caller attempts a state transition that is not allowed. */
export class InvalidTransitionError extends Error {
  constructor(from: AgentState, to: AgentState) {
    super(`Invalid state transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Manages the current state of an agent and enforces valid transition rules.
 *
 * @example
 * ```ts
 * const sm = new AgentStateMachine();
 * sm.transition(AgentState.INITIALIZING); // IDLE → INITIALIZING ✓
 * sm.transition(AgentState.COMPLETED);    // throws InvalidTransitionError ✗
 * ```
 */
export class AgentStateMachine {
  private currentState: AgentState;

  /**
   * @param initialState Starting state. Defaults to {@link AgentState.IDLE}.
   */
  constructor(initialState: AgentState = AgentState.IDLE) {
    this.currentState = initialState;
  }

  /** Returns the current state. */
  getState(): AgentState {
    return this.currentState;
  }

  /**
   * Transitions to `nextState` if the transition is valid.
   * @throws {InvalidTransitionError} When the transition is not allowed.
   */
  transition(nextState: AgentState): void {
    if (!this.canTransition(nextState)) {
      throw new InvalidTransitionError(this.currentState, nextState);
    }
    this.currentState = nextState;
  }

  /**
   * Returns `true` if transitioning to `nextState` from the current state
   * is permitted without throwing.
   */
  canTransition(nextState: AgentState): boolean {
    return (VALID_TRANSITIONS[this.currentState] as readonly AgentState[]).includes(nextState);
  }

  /**
   * Returns `true` when the current state has no further allowed transitions
   * (i.e., COMPLETED, FAILED, or CANCELLED).
   */
  isTerminal(): boolean {
    return VALID_TRANSITIONS[this.currentState].length === 0;
  }
}

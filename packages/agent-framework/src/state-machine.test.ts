import { AgentStateMachine, InvalidTransitionError } from './state-machine';
import { AgentState } from './types';

describe('AgentStateMachine', () => {
  describe('initial state', () => {
    it('defaults to IDLE', () => {
      const sm = new AgentStateMachine();
      expect(sm.getState()).toBe(AgentState.IDLE);
    });

    it('accepts a custom initial state', () => {
      const sm = new AgentStateMachine(AgentState.RUNNING);
      expect(sm.getState()).toBe(AgentState.RUNNING);
    });
  });

  describe('valid transitions', () => {
    it('IDLE → INITIALIZING', () => {
      const sm = new AgentStateMachine();
      sm.transition(AgentState.INITIALIZING);
      expect(sm.getState()).toBe(AgentState.INITIALIZING);
    });

    it('IDLE → CANCELLED', () => {
      const sm = new AgentStateMachine();
      sm.transition(AgentState.CANCELLED);
      expect(sm.getState()).toBe(AgentState.CANCELLED);
    });

    it('INITIALIZING → RUNNING', () => {
      const sm = new AgentStateMachine(AgentState.INITIALIZING);
      sm.transition(AgentState.RUNNING);
      expect(sm.getState()).toBe(AgentState.RUNNING);
    });

    it('INITIALIZING → FAILED', () => {
      const sm = new AgentStateMachine(AgentState.INITIALIZING);
      sm.transition(AgentState.FAILED);
      expect(sm.getState()).toBe(AgentState.FAILED);
    });

    it('INITIALIZING → CANCELLED', () => {
      const sm = new AgentStateMachine(AgentState.INITIALIZING);
      sm.transition(AgentState.CANCELLED);
      expect(sm.getState()).toBe(AgentState.CANCELLED);
    });

    it('RUNNING → COMPLETED', () => {
      const sm = new AgentStateMachine(AgentState.RUNNING);
      sm.transition(AgentState.COMPLETED);
      expect(sm.getState()).toBe(AgentState.COMPLETED);
    });

    it('RUNNING → FAILED', () => {
      const sm = new AgentStateMachine(AgentState.RUNNING);
      sm.transition(AgentState.FAILED);
      expect(sm.getState()).toBe(AgentState.FAILED);
    });

    it('RUNNING → CANCELLED', () => {
      const sm = new AgentStateMachine(AgentState.RUNNING);
      sm.transition(AgentState.CANCELLED);
      expect(sm.getState()).toBe(AgentState.CANCELLED);
    });
  });

  describe('invalid transitions', () => {
    it('IDLE → RUNNING throws InvalidTransitionError', () => {
      const sm = new AgentStateMachine();
      expect(() => sm.transition(AgentState.RUNNING)).toThrow(InvalidTransitionError);
    });

    it('IDLE → COMPLETED throws', () => {
      const sm = new AgentStateMachine();
      expect(() => sm.transition(AgentState.COMPLETED)).toThrow(InvalidTransitionError);
    });

    it('IDLE → FAILED throws', () => {
      const sm = new AgentStateMachine();
      expect(() => sm.transition(AgentState.FAILED)).toThrow(InvalidTransitionError);
    });

    it('COMPLETED → anything throws', () => {
      const sm = new AgentStateMachine(AgentState.COMPLETED);
      expect(() => sm.transition(AgentState.IDLE)).toThrow(InvalidTransitionError);
      expect(() => sm.transition(AgentState.RUNNING)).toThrow(InvalidTransitionError);
      expect(() => sm.transition(AgentState.FAILED)).toThrow(InvalidTransitionError);
    });

    it('FAILED → anything throws', () => {
      const sm = new AgentStateMachine(AgentState.FAILED);
      expect(() => sm.transition(AgentState.IDLE)).toThrow(InvalidTransitionError);
      expect(() => sm.transition(AgentState.RUNNING)).toThrow(InvalidTransitionError);
    });

    it('CANCELLED → anything throws', () => {
      const sm = new AgentStateMachine(AgentState.CANCELLED);
      expect(() => sm.transition(AgentState.IDLE)).toThrow(InvalidTransitionError);
      expect(() => sm.transition(AgentState.RUNNING)).toThrow(InvalidTransitionError);
    });

    it('error message includes from/to state names', () => {
      const sm = new AgentStateMachine();
      expect(() => sm.transition(AgentState.COMPLETED)).toThrow(
        /IDLE.*COMPLETED/,
      );
    });
  });

  describe('canTransition', () => {
    it('returns true for allowed transitions', () => {
      const sm = new AgentStateMachine();
      expect(sm.canTransition(AgentState.INITIALIZING)).toBe(true);
      expect(sm.canTransition(AgentState.CANCELLED)).toBe(true);
    });

    it('returns false for disallowed transitions', () => {
      const sm = new AgentStateMachine();
      expect(sm.canTransition(AgentState.RUNNING)).toBe(false);
      expect(sm.canTransition(AgentState.COMPLETED)).toBe(false);
      expect(sm.canTransition(AgentState.FAILED)).toBe(false);
    });

    it('does not mutate state', () => {
      const sm = new AgentStateMachine();
      sm.canTransition(AgentState.INITIALIZING);
      expect(sm.getState()).toBe(AgentState.IDLE);
    });
  });

  describe('isTerminal', () => {
    it('returns false for non-terminal states', () => {
      expect(new AgentStateMachine(AgentState.IDLE).isTerminal()).toBe(false);
      expect(new AgentStateMachine(AgentState.INITIALIZING).isTerminal()).toBe(false);
      expect(new AgentStateMachine(AgentState.RUNNING).isTerminal()).toBe(false);
    });

    it('returns true for COMPLETED', () => {
      expect(new AgentStateMachine(AgentState.COMPLETED).isTerminal()).toBe(true);
    });

    it('returns true for FAILED', () => {
      expect(new AgentStateMachine(AgentState.FAILED).isTerminal()).toBe(true);
    });

    it('returns true for CANCELLED', () => {
      expect(new AgentStateMachine(AgentState.CANCELLED).isTerminal()).toBe(true);
    });
  });
});

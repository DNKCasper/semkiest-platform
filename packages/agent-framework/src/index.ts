/**
 * @semkiest/agent-framework
 *
 * Agent Framework package providing:
 *  - Typed event definitions for inter-agent communication (SEM-54)
 *  - Redis pub/sub EventBus with correlation-ID propagation
 *  - Dead-letter queue for undeliverable events
 *  - Socket.IO streaming integration for real-time dashboard updates
 *  - Event handlers for all lifecycle and result events
 */
export * from './events';

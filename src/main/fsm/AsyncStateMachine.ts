/**
 * Generic Async State Machine Base Class
 * Supports async guard, onEntry, onExit hooks
 */

export type StateHooks<TContext> = {
  guard?: (ctx: TContext, event: string, payload?: unknown) => Promise<boolean> | boolean
  onEntry?: (ctx: TContext, event: string, payload?: unknown) => Promise<void> | void
  onExit?: (ctx: TContext, event: string, payload?: unknown) => Promise<void> | void
}

export type TransitionTarget<TState extends string> = TState | { target: TState; action?: string }

export type TransitionMap<TState extends string> = Record<string, TransitionTarget<TState>>

export type StateChangeListener<TState extends string, TContext> = (
  prevState: TState,
  newState: TState,
  event: string,
  context: TContext
) => void

export abstract class AsyncStateMachine<TState extends string, TContext> {
  protected state: TState
  protected context: TContext
  private isTransitioning = false
  private listeners: Set<StateChangeListener<TState, TContext>> = new Set()
  private pendingEvents: Array<{ event: string; payload?: unknown }> = []

  constructor(initialState: TState, initialContext: TContext) {
    this.state = initialState
    this.context = initialContext
  }

  /**
   * Define available transitions for each state
   * Override in subclass
   */
  protected abstract getTransitions(): Record<TState, TransitionMap<TState>>

  /**
   * Get hooks for a specific state
   * Override in subclass to provide guard/onEntry/onExit
   */
  protected getStateHooks(_state: TState): StateHooks<TContext> {
    return {}
  }

  /**
   * Send an event to trigger state transition
   */
  async send(event: string, payload?: unknown): Promise<boolean> {
    // If currently transitioning, queue the event for later processing
    if (this.isTransitioning) {
      console.log(`[FSM] Transition in progress, queuing event: ${event}`)
      // Queue the event and return true immediately to avoid deadlock
      // The event will be processed after current transition completes
      this.pendingEvents.push({ event, payload })
      return true
    }

    return this.processEvent(event, payload)
  }

  /**
   * Process a single event (internal)
   */
  private async processEvent(event: string, payload?: unknown): Promise<boolean> {
    const transitions = this.getTransitions()
    const currentTransitions = transitions[this.state]

    if (!currentTransitions || !(event in currentTransitions)) {
      console.warn(`[FSM] No transition for ${this.state} --${event}-->`)
      return false
    }

    const transitionConfig = currentTransitions[event]
    const targetState =
      typeof transitionConfig === 'string' ? transitionConfig : transitionConfig.target

    this.isTransitioning = true
    const prevState = this.state

    try {
      // 1. Execute target state's guard (pre-transition check)
      const targetHooks = this.getStateHooks(targetState)
      if (targetHooks.guard) {
        const canEnter = await targetHooks.guard(this.context, event, payload)
        if (!canEnter) {
          console.log(`[FSM] Guard rejected: ${this.state} --${event}--> ${targetState}`)
          return false
        }
      }

      // 2. Execute current state's onExit
      const currentHooks = this.getStateHooks(this.state)
      if (currentHooks.onExit) {
        console.log(`[FSM] Exit: ${this.state}`)
        await currentHooks.onExit(this.context, event, payload)
      }

      // 3. Transition to new state
      this.state = targetState
      console.log(`[FSM] ${prevState} --${event}--> ${targetState}`)

      // 4. Execute target state's onEntry
      if (targetHooks.onEntry) {
        console.log(`[FSM] Entry: ${targetState}`)
        await targetHooks.onEntry(this.context, event, payload)
      }

      // 5. Notify listeners
      this.notifyListeners(prevState, targetState, event)

      return true
    } catch (error) {
      console.error(`[FSM] Transition error:`, error)
      // Optionally handle error state
      return false
    } finally {
      this.isTransitioning = false
      // Process any pending events that were queued during this transition
      await this.processPendingEvents()
    }
  }

  /**
   * Process pending events that were queued during transition
   */
  private async processPendingEvents(): Promise<void> {
    while (this.pendingEvents.length > 0) {
      const pending = this.pendingEvents.shift()!
      console.log(`[FSM] Processing pending event: ${pending.event}`)
      await this.processEvent(pending.event, pending.payload)
    }
  }

  /**
   * Get current state
   */
  getState(): TState {
    return this.state
  }

  /**
   * Get current context
   */
  getContext(): TContext {
    return { ...this.context }
  }

  /**
   * Update context
   */
  protected updateContext(updates: Partial<TContext>): void {
    this.context = { ...this.context, ...updates }
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: StateChangeListener<TState, TContext>): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Check if in a specific state
   */
  matches(state: TState): boolean {
    return this.state === state
  }

  /**
   * Check if can transition with given event
   */
  can(event: string): boolean {
    const transitions = this.getTransitions()
    return event in (transitions[this.state] || {})
  }

  private notifyListeners(prevState: TState, newState: TState, event: string): void {
    for (const listener of this.listeners) {
      try {
        listener(prevState, newState, event, this.context)
      } catch (err) {
        console.error('[FSM] Listener error:', err)
      }
    }
  }
}

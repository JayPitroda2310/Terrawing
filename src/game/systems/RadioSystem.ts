import type { EventBus } from '@/game/core/EventBus';
import type { GameEvents } from '@/game/core/GameEvents';
import type { RadioMessageDefinition } from '@/game/missions/MissionDefinition';

/**
 * Plays mission radio chatter in response to gameplay events. Messages are pure data in the
 * mission definition; each fires at most once per session.
 */
export class RadioSystem {
  private readonly fired = new Set<string>();
  private readonly delayed: { message: RadioMessageDefinition; remaining: number }[] = [];
  private readonly unsubscribers: (() => void)[] = [];

  constructor(
    private readonly messages: readonly RadioMessageDefinition[],
    private readonly events: EventBus<GameEvents>,
  ) {
    this.unsubscribers.push(
      events.on('objective:completed', ({ objectiveId }) =>
        this.trigger((t) => t.type === 'objectiveCompleted' && t.objectiveId === objectiveId),
      ),
      events.on('scan:detected', ({ targetId }) =>
        this.trigger((t) => t.type === 'scanDetected' && t.targetId === targetId),
      ),
      events.on('hazard:entered', ({ hazardId }) =>
        this.trigger((t) => t.type === 'hazardEntered' && t.hazardId === hazardId),
      ),
      events.on('battery:level', ({ level }) =>
        this.trigger((t) => t.type === 'batteryLevel' && t.level === level),
      ),
      events.on('signal:state', ({ state }) => {
        if (state === 'unstable') this.trigger((t) => t.type === 'signalLost');
      }),
    );
  }

  /** Queues mission-start messages. Call once gameplay begins. */
  start(): void {
    for (const message of this.messages) {
      if (message.trigger.type === 'missionStart') {
        this.delayed.push({ message, remaining: message.trigger.delay });
      }
    }
  }

  update(dt: number): void {
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const entry = this.delayed[i]!;
      entry.remaining -= dt;
      if (entry.remaining <= 0) {
        this.delayed.splice(i, 1);
        this.send(entry.message);
      }
    }
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
  }

  private trigger(match: (trigger: RadioMessageDefinition['trigger']) => boolean): void {
    for (const message of this.messages) if (match(message.trigger)) this.send(message);
  }

  private send(message: RadioMessageDefinition): void {
    if (this.fired.has(message.id)) return;
    this.fired.add(message.id);
    this.events.emit('radio:message', {
      id: message.id,
      speaker: message.speaker,
      text: message.text,
    });
  }
}

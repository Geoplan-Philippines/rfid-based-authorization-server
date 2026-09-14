import { Injectable, Logger, MessageEvent, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject, filter, interval, map, merge } from 'rxjs';

import { TransactionEvent, TransactionEventType } from './types/transactions.types';

// In-process event bus for transaction Server-Sent Events (SSE).
// Broadcasts realtime events (e.g. transaction.created when RFID reader triggers a read)
// to connected browser clients so the transactions list updates without manual refresh.
@Injectable()
export class TransactionEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(TransactionEventsService.name);
  private readonly events$ = new Subject<TransactionEvent>();

  /**
   * Publish a transaction event to all connected SSE clients.
   */
  publish(event: TransactionEvent): void {
    this.logger.log(`Publishing ${event.type} for ${event.data.eventCode}`);
    this.events$.next(event);
  }

  /**
   * Observable stream for SSE subscribers. Emits real transaction events as MessageEvents,
   * merged with a 25-second heartbeat ping to maintain persistent TCP connections through proxies.
   */
  stream(eventType?: TransactionEventType): Observable<MessageEvent> {
    const events$ = (
      eventType
        ? this.events$.asObservable().pipe(filter((e) => e.type === eventType))
        : this.events$.asObservable()
    ).pipe(
      map(
        (event): MessageEvent => ({
          id: event.data.id,
          type: event.type,
          data: {
            type: event.type,
            data: event.data,
          },
        }),
      ),
    );

    const heartbeat$ = interval(25_000).pipe(
      map(
        (): MessageEvent => ({
          type: 'heartbeat',
          data: { timestamp: new Date().toISOString() },
        }),
      ),
    );

    return merge(events$, heartbeat$);
  }

  onModuleDestroy(): void {
    this.events$.complete();
  }
}

import { registerNotificationConsumer, registerQueueConsumer, type DomainEvent } from "../services/eventBus";

import { handleDomainEventNotification } from "../services/notificationSubscriber";

import { jobQueue } from "./jobQueue";



/** Wire EVENT-1 hooks to QUEUE-1 workers + NOTIF-1 subscriber. */

export function wireQueueFromEventBus() {

  registerQueueConsumer(async (event: DomainEvent) => {

    await jobQueue.enqueue(

      "event_log",

      "persist-event",

      {

        event_name: event.event_name,

        event_id: event.id,

        event_payload: event.payload,

        correlation_id: event.correlation_id,

        published_by: event.published_by,

        occurred_at: event.occurred_at,

      },

      { correlation_id: event.correlation_id },

    );

  });



  registerNotificationConsumer(async (event: DomainEvent) => {

    await handleDomainEventNotification(event);

  });

}


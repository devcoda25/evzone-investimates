import { OutboxPublisherService } from "./outbox-publisher.service";

describe("OutboxPublisherService", () => {
  it("publishes pending events and queues notification dispatches", async () => {
    const event = {
      id: "evt_1",
      topic: "project.approved",
      eventType: "project.approved",
      eventKey: "project.approved:123",
      payload: { projectId: "123" },
    };
    const outbox = {
      findPending: jest.fn().mockResolvedValue([event]),
      markPublished: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    const publisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    const notifications = {
      enqueueFromEvent: jest.fn().mockResolvedValue(true),
    };

    const service = new OutboxPublisherService(
      outbox as any,
      publisher as any,
      notifications as any,
    );

    await expect(service.processBatch(10)).resolves.toBe(1);

    expect(outbox.findPending).toHaveBeenCalledWith(10);
    expect(publisher.publish).toHaveBeenCalledWith(
      event.topic,
      event.eventKey,
      event.payload,
    );
    expect(outbox.markPublished).toHaveBeenCalledWith(event.id);
    expect(notifications.enqueueFromEvent).toHaveBeenCalledWith(event);
    expect(outbox.markFailed).not.toHaveBeenCalled();
  });

  it("marks events as failed when publishing throws", async () => {
    const event = {
      id: "evt_2",
      topic: "investment.created",
      eventType: "investment.created",
      eventKey: "investment.created:456",
      payload: { investmentId: "456" },
    };
    const outbox = {
      findPending: jest.fn().mockResolvedValue([event]),
      markPublished: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    const publisher = {
      publish: jest.fn().mockRejectedValue(new Error("kafka unavailable")),
    };
    const notifications = {
      enqueueFromEvent: jest.fn().mockResolvedValue(true),
    };

    const service = new OutboxPublisherService(
      outbox as any,
      publisher as any,
      notifications as any,
    );

    await expect(service.processBatch()).resolves.toBe(1);

    expect(outbox.markFailed).toHaveBeenCalledTimes(1);
    expect(outbox.markPublished).not.toHaveBeenCalled();
    expect(notifications.enqueueFromEvent).not.toHaveBeenCalled();
  });
});

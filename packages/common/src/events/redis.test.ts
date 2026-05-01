import { describe, expect, it, vi } from 'vitest';
import { RedisEventBus } from './redis.js';
import type { EventEnvelope } from './types.js';

type RedisMock = {
  duplicate: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  xadd: ReturnType<typeof vi.fn>;
  xack: ReturnType<typeof vi.fn>;
  xgroup: ReturnType<typeof vi.fn>;
  xreadgroup: ReturnType<typeof vi.fn>;
};

function createRedisMocks(): { pub: RedisMock; sub: RedisMock } {
  const sub: RedisMock = {
    duplicate: vi.fn(),
    quit: vi.fn().mockResolvedValue('OK'),
    xadd: vi.fn(),
    xack: vi.fn().mockResolvedValue(1),
    xgroup: vi.fn().mockResolvedValue('OK'),
    xreadgroup: vi.fn(() => new Promise(() => undefined)),
  };
  const pub: RedisMock = {
    duplicate: vi.fn(() => sub),
    quit: vi.fn().mockResolvedValue('OK'),
    xadd: vi.fn().mockResolvedValue('1-0'),
    xack: vi.fn(),
    xgroup: vi.fn(),
    xreadgroup: vi.fn(),
  };
  return { pub, sub };
}

function event(id = 'evt-1'): EventEnvelope<{ ok: boolean }> {
  return {
    id,
    type: 'test.event',
    timestamp: '2026-04-30T00:00:00.000Z',
    payload: { ok: true },
  };
}

function streamResult(topic: string, msgId: string, envelope: EventEnvelope): unknown {
  return [[topic, [[msgId, ['type', envelope.type, 'payload', JSON.stringify(envelope)]]]]];
}

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (err: Error) => void } {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('RedisEventBus.publish', () => {
  it('uses approximate MAXLEN trimming by default', async () => {
    const { pub } = createRedisMocks();
    const bus = new RedisEventBus({ client: pub as never });
    const envelope = event();

    await bus.publish('topic-a', envelope);

    expect(pub.xadd).toHaveBeenCalledWith(
      'topic-a',
      'MAXLEN',
      '~',
      10_000,
      '*',
      'type',
      envelope.type,
      'payload',
      JSON.stringify(envelope),
    );
    await bus.close();
  });

  it('allows the stream MAXLEN cap to be configured', async () => {
    const { pub } = createRedisMocks();
    const bus = new RedisEventBus({ client: pub as never, streamMaxLen: 250 });
    const envelope = event();

    await bus.publish('topic-a', envelope);

    expect(pub.xadd).toHaveBeenCalledWith(
      'topic-a',
      'MAXLEN',
      '~',
      250,
      '*',
      'type',
      envelope.type,
      'payload',
      JSON.stringify(envelope),
    );
    await bus.close();
  });
});

describe('RedisEventBus.subscribe', () => {
  it('acks only after async handlers complete', async () => {
    const { pub, sub } = createRedisMocks();
    const envelope = event();
    const handled = deferred();
    sub.xreadgroup
      .mockResolvedValueOnce(streamResult('topic-a', '1-0', envelope))
      .mockImplementation(() => new Promise(() => undefined));
    const bus = new RedisEventBus({
      client: pub as never,
      group: 'group-a',
      consumer: 'consumer-a',
    });

    bus.subscribe('topic-a', () => handled.promise);

    await vi.waitFor(() => {
      expect(sub.xreadgroup).toHaveBeenCalledTimes(1);
    });
    expect(sub.xack).not.toHaveBeenCalled();

    handled.resolve();

    await vi.waitFor(() => {
      expect(sub.xack).toHaveBeenCalledWith('topic-a', 'group-a', '1-0');
    });
    await bus.close();
  });

  it('does not ack when a handler fails', async () => {
    const { pub, sub } = createRedisMocks();
    const envelope = event();
    sub.xreadgroup
      .mockResolvedValueOnce(streamResult('topic-a', '1-0', envelope))
      .mockImplementation(() => new Promise(() => undefined));
    const bus = new RedisEventBus({
      client: pub as never,
      group: 'group-a',
      consumer: 'consumer-a',
    });

    bus.subscribe('topic-a', async () => {
      throw new Error('boom');
    });

    await vi.waitFor(() => {
      expect(sub.xreadgroup).toHaveBeenCalledTimes(2);
    });
    expect(sub.xack).not.toHaveBeenCalled();
    await bus.close();
  });
});

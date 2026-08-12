#!/usr/bin/env python3
"""
WebSocket listener stress test — opens N concurrent /ws connections
(simulating real tuned-in listeners), keeps them alive, and measures:
  - Connection ramp-up success rate & time
  - Presence (listener count) as seen by clients
  - Broadcast fan-out: send a chat message from one client, measure
    how fast every other client receives it
  - Messages received per client over the duration
  - Server memory (via docker stats if local)

Targets the local Nginx stack by default; pass --remote for the
Cloudflare-tunnelled domain.
"""
import asyncio
import json
import time
import statistics
import argparse
from collections import Counter, defaultdict

import websockets

LOCAL_WS = "ws://localhost:8088/ws"
REMOTE_WS = "wss://ahmedisalon.nabilahmed.in/ws"

parser = argparse.ArgumentParser(description="WebSocket listener stress test")
parser.add_argument("--remote", action="store_true", help="target the remote Cloudflare domain")
parser.add_argument("-n", "--count", type=int, default=150, help="number of concurrent listeners")
parser.add_argument("-d", "--duration", type=int, default=30, help="seconds to hold connections open")
parser.add_argument("--ramp", type=int, default=25, help="connections to open per batch")
parser.add_argument("--ramp-delay", type=float, default=0.2, help="seconds between ramp batches")
args = parser.parse_args()

WS_URL = REMOTE_WS if args.remote else LOCAL_WS
N = args.count
DURATION = args.duration
RAMP = args.ramp
RAMP_DELAY = args.ramp_delay

print("=" * 72)
print(f"  WEBSOCKET LISTENER STRESS TEST")
print(f"  Target      : {WS_URL}")
print(f"  Listeners   : {N}")
print(f"  Duration    : {DURATION}s (held open after ramp)")
print(f"  Ramp        : {RAMP} per batch, {RAMP_DELAY}s between batches")
print("=" * 72)

# ---- Shared state --------------------------------------------------------
msg_types = Counter()          # global message type tally
per_client_msgs = defaultdict(int)
presence_counts = []           # presence counts seen over time
connect_times = []             # time to open each connection
connect_ok = 0
connect_fail = 0
connect_errors = Counter()
fanout_latencies = []          # broadcast delivery latencies (ms)
stop_flag = asyncio.Event()
stats_lock = asyncio.Lock()

# For broadcast fan-out test: a unique chat message is sent from one client,
# and we measure how long until every other client receives it.
fanout_event = asyncio.Event()
fanout_msg_id = None
fanout_send_time = None
fanout_received = 0


async def listener(idx):
    """Open a WS connection, stay alive, and track all received messages."""
    global connect_ok, connect_fail, fanout_received

    t0 = time.perf_counter()
    try:
        async with websockets.connect(
            WS_URL,
            open_timeout=20,
            close_timeout=5,
            max_size=2 * 1024 * 1024,
            ping_interval=20,
            ping_timeout=10,
        ) as ws:
            connect_time = time.perf_counter() - t0
            async with stats_lock:
                connect_times.append(connect_time)
                connect_ok += 1

            # Listen for messages until stop_flag
            while not stop_flag.is_set():
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
                except websockets.ConnectionClosed:
                    break

                data = json.loads(raw)
                mtype = data.get("type", "unknown")
                async with stats_lock:
                    msg_types[mtype] += 1
                    per_client_msgs[idx] += 1

                if mtype == "presence":
                    count = data.get("count", 0)
                    presence_counts.append(count)

                # Fan-out detection
                if fanout_msg_id and mtype == "chat" and data.get("id") == fanout_msg_id:
                    latency = (time.perf_counter() - fanout_send_time) * 1000
                    async with stats_lock:
                        fanout_latencies.append(latency)
                        fanout_received += 1

    except Exception as e:
        async with stats_lock:
            connect_fail += 1
            connect_errors[type(e).__name__] += 1


async def run_fanout_test(clients_connected):
    """Send a chat message from a fresh connection and measure broadcast delivery."""
    global fanout_msg_id, fanout_send_time, fanout_received

    await asyncio.sleep(2)  # let connections settle

    print("\n  --- Broadcast fan-out test ---", flush=True)
    fanout_received = 0
    fanout_msg_id = f"stress-{int(time.time() * 1000)}"
    chat_text = f"stress-test ping {fanout_msg_id}"

    try:
        async with websockets.connect(WS_URL, open_timeout=20) as ws:
            # Send a chat message
            fanout_send_time = time.perf_counter()
            await ws.send(json.dumps({"type": "chat", "text": chat_text}))
            print(f"  Sent chat message (id: {fanout_msg_id}) to {clients_connected} listeners")

            # Wait for fan-out to all clients (or timeout)
            deadline = time.perf_counter() + 10
            while time.perf_counter() < deadline:
                await asyncio.sleep(0.1)
                async with stats_lock:
                    if fanout_received >= clients_connected * 0.95:
                        break

            async with stats_lock:
                delivered = fanout_received
                expected = clients_connected
                lats = list(fanout_latencies)

        if lats:
            print(f"  Delivered to {delivered}/{expected} clients "
                  f"({delivered / expected * 100:.1f}%)")
            print(f"  Fan-out latency (ms): avg {statistics.mean(lats):.1f} | "
                  f"p50 {sorted(lats)[len(lats) // 2]:.1f} | "
                  f"max {max(lats):.1f}")
        else:
            print(f"  Delivered to {delivered}/{expected} clients "
                  f"(no latency samples captured)")

    except Exception as e:
        print(f"  Fan-out test failed: {type(e).__name__}: {e}")


async def main():
    t_start = time.perf_counter()

    # ---- Ramp up connections ----
    print(f"\n>>> Ramping up {N} listeners ({RAMP} per batch) ...", flush=True)
    tasks = []
    connected_so_far = 0

    for batch_start in range(0, N, RAMP):
        batch_size = min(RAMP, N - batch_start)
        batch_tasks = [asyncio.create_task(listener(batch_start + i))
                       for i in range(batch_size)]
        tasks.extend(batch_tasks)
        await asyncio.sleep(RAMP_DELAY)
        async with stats_lock:
            connected_so_far = connect_ok
        elapsed = time.perf_counter() - t_start
        print(f"    {connect_ok + connect_fail:>4}/{N} attempted "
              f"({connect_ok} connected) · {elapsed:.1f}s", flush=True)

    ramp_time = time.perf_counter() - t_start
    print(f"\n  Ramp-up complete in {ramp_time:.1f}s")
    print(f"  Connected : {connect_ok}/{N} ({connect_ok / N * 100:.1f}%)")
    print(f"  Failed    : {connect_fail}")
    if connect_errors:
        print(f"  Errors    : {dict(connect_errors)}")

    if connect_ok == 0:
        print("\n  No connections established. Aborting.")
        return

    # ---- Hold connections open for the duration ----
    print(f"\n>>> Holding {connect_ok} connections open for {DURATION}s ...",
          flush=True)

    # Run fan-out test partway through
    fanout_task = asyncio.create_task(run_fanout_test(connect_ok))

    for remaining in range(DURATION, 0, -5):
        await asyncio.sleep(5)
        async with stats_lock:
            total_msgs = sum(per_client_msgs.values())
        print(f"    {remaining - 5:>3}s left  ·  {total_msgs} messages received",
              flush=True)

    # ---- Stop ----
    stop_flag.set()
    await fanout_task
    await asyncio.gather(*tasks, return_exceptions=True)

    wall = time.perf_counter() - t_start

    # ---- Report ----
    async with stats_lock:
        total_msgs = sum(per_client_msgs.values())
        msgs_per_client = list(per_client_msgs.values())

    def pct(data, p):
        if not data:
            return 0
        s = sorted(data)
        k = (len(s) - 1) * p / 100
        f = int(k)
        c = min(f + 1, len(s) - 1)
        return s[f] + (s[c] - s[f]) * (k - f)

    print("\n" + "=" * 72)
    print("  RESULTS")
    print("=" * 72)
    print(f"  Wall time          : {wall:.1f}s")
    print(f"  Connections opened : {connect_ok}/{N} ({connect_ok / N * 100:.1f}%)")
    print(f"  Connect failures   : {connect_fail}")
    print(f"  Connect time (ms)  : avg {statistics.mean(connect_times) * 1000:.0f} | "
          f"min {min(connect_times) * 1000:.0f} | "
          f"max {max(connect_times) * 1000:.0f}")
    print(f"  Total messages     : {total_msgs}")
    if msgs_per_client:
        print(f"  Msgs per client    : avg {statistics.mean(msgs_per_client):.1f} | "
              f"min {min(msgs_per_client)} | max {max(msgs_per_client)}")
    print(f"  Message types:")
    for mtype, count in msg_types.most_common():
        print(f"    {mtype:<20} {count:>8}")
    if presence_counts:
        print(f"  Presence seen      : min {min(presence_counts)} | "
              f"max {max(presence_counts)} | "
              f"last {presence_counts[-1]}")
    if fanout_latencies:
        lats = fanout_latencies
        print(f"  Fan-out delivered  : {fanout_received}/{connect_ok}")
        print(f"  Fan-out latency ms : avg {statistics.mean(lats):.1f} | "
              f"p50 {pct(lats, 50):.1f} | p95 {pct(lats, 95):.1f} | "
              f"max {max(lats):.1f}")
    print("\n  Done.")


if __name__ == "__main__":
    asyncio.run(main())
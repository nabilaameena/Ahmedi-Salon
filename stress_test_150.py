#!/usr/bin/env python3
"""
Sustained stress test at 150 concurrent connections against
ahmedisalon.nabilahmed.in — holds the connection count steady
for a fixed duration and reports throughput, latency, and errors.
"""
import time
import statistics
import concurrent.futures
import threading
from collections import Counter

import requests

BASE = "https://ahmedisalon.nabilahmed.in"
ENDPOINTS = [("/", "GET"), ("/api/state", "GET")]
CONCURRENCY = 150
DURATION = 30  # seconds to sustain load
TIMEOUT = 20

print("=" * 72)
print(f"  SUSTAINED LOAD  ·  {BASE}")
print(f"  Concurrency : {CONCURRENCY} workers")
print(f"  Duration    : {DURATION}s (each worker loops until time is up)")
print(f"  Endpoints   : {', '.join(p for p, _ in ENDPOINTS)}")
print("=" * 72)

latencies = []
statuses = Counter()
errors = Counter()
ok_count = 0
fail_count = 0
stop_flag = threading.Event()
stats_lock = threading.Lock()

tls = threading.local()

def get_session():
    if not hasattr(tls, "session"):
        tls.session = requests.Session()
        tls.session.headers.update({"User-Agent": "stress-test/1.5"})
    return tls.session

def worker(worker_id):
    global ok_count, fail_count
    session = get_session()
    idx = 0
    while not stop_flag.is_set():
        path, method = ENDPOINTS[idx % len(ENDPOINTS)]
        idx += 1
        t0 = time.perf_counter()
        try:
            resp = session.request(method, BASE + path, timeout=TIMEOUT)
            elapsed = time.perf_counter() - t0
            with stats_lock:
                latencies.append(elapsed)
                statuses[resp.status_code] += 1
                if resp.status_code < 400:
                    ok_count += 1
                else:
                    fail_count += 1
        except requests.RequestException as e:
            elapsed = time.perf_counter() - t0
            with stats_lock:
                latencies.append(elapsed)
                errors[type(e).__name__] += 1
                fail_count += 1

start = time.perf_counter()
print(f"\n>>> Launching {CONCURRENCY} workers for {DURATION}s ...", flush=True)

with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
    futures = [pool.submit(worker, i) for i in range(CONCURRENCY)]
    # Let it run for the duration, sampling progress
    for remaining in range(DURATION, 0, -5):
        time.sleep(5)
        with stats_lock:
            done = ok_count + fail_count
        print(f"    {remaining - 5:>3}s left  ·  {done} requests so far", flush=True)
    stop_flag.set()
    # Wait for workers to finish in-flight requests
    for f in concurrent.futures.as_completed(futures):
        f.result()

wall = time.perf_counter() - start

# Compute stats
def pct(data, p):
    if not data:
        return 0
    s = sorted(data)
    k = (len(s) - 1) * p / 100
    f = int(k)
    c = min(f + 1, len(s) - 1)
    return s[f] + (s[c] - s[f]) * (k - f)

total = ok_count + fail_count
err_rate = (fail_count / total * 100) if total else 0
avg = statistics.mean(latencies) * 1000 if latencies else 0
p50 = pct(latencies, 50) * 1000
p75 = pct(latencies, 75) * 1000
p90 = pct(latencies, 90) * 1000
p95 = pct(latencies, 95) * 1000
p99 = pct(latencies, 99) * 1000
mn = min(latencies) * 1000 if latencies else 0
mx = max(latencies) * 1000 if latencies else 0

print("\n" + "=" * 72)
print("  RESULTS")
print("=" * 72)
print(f"  Duration       : {wall:.1f}s")
print(f"  Total requests : {total}")
print(f"  Successful     : {ok_count}")
print(f"  Failed         : {fail_count} ({err_rate:.1f}%)")
print(f"  Throughput     : {total / wall:.1f} req/s")
print(f"  Latency (ms)   : avg {avg:.0f} | min {mn:.0f} | "
      f"p50 {p50:.0f} | p75 {p75:.0f} | p90 {p90:.0f} | "
      f"p95 {p95:.0f} | p99 {p99:.0f} | max {mx:.0f}")
status_str = ", ".join(f"{k}:{v}" for k, v in sorted(statuses.items()))
print(f"  Status codes   : {status_str}")
if errors:
    err_str = ", ".join(f"{k}:{v}" for k, v in errors.items())
    print(f"  Errors         : {err_str}")
print("\n  Done.")
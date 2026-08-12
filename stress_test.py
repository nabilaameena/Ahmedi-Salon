#!/usr/bin/env python3
"""
Stress test for ahmedisalon.nabilahmed.in
Ramps up concurrent users against the homepage and /api/state endpoint,
reporting throughput, latency percentiles, and error rates per level.
"""
import sys
import time
import statistics
import concurrent.futures
import threading
from collections import Counter

import requests

BASE = "https://ahmedisalon.nabilahmed.in"
ENDPOINTS = [("/", "GET"), ("/api/state", "GET")]
TIMEOUT = 15

# Concurrency levels to test (number of concurrent workers)
LEVELS = [1, 5, 10, 25, 50, 100, 150, 200]
REQUESTS_PER_LEVEL = 60  # total requests dispatched per concurrency level

print("=" * 78)
print(f"  STRESS TEST  ·  {BASE}")
print(f"  Endpoints: {', '.join(p for p, _ in ENDPOINTS)}")
print(f"  Levels: {LEVELS}  (concurrent workers)")
print(f"  Requests per level: {REQUESTS_PER_LEVEL}  (split across endpoints)")
print("=" * 78)

# Global stats collected per (level, endpoint)
results_lock = threading.Lock()


def do_request(session, path, method):
    url = BASE + path
    t0 = time.perf_counter()
    try:
        resp = session.request(method, url, timeout=TIMEOUT)
        elapsed = time.perf_counter() - t0
        return {
            "path": path,
            "status": resp.status_code,
            "elapsed": elapsed,
            "ok": resp.status_code < 400,
            "error": None,
        }
    except requests.RequestException as e:
        elapsed = time.perf_counter() - t0
        return {
            "path": path,
            "status": 0,
            "elapsed": elapsed,
            "ok": False,
            "error": type(e).__name__,
        }


def percentile(data, pct):
    if not data:
        return 0
    s = sorted(data)
    k = (len(s) - 1) * pct / 100
    f = int(k)
    c = min(f + 1, len(s) - 1)
    return s[f] + (s[c] - s[f]) * (k - f)


def run_level(concurrency):
    """Run REQUESTS_PER_LEVEL requests with `concurrency` workers."""
    # Build the work queue: alternate endpoints
    tasks = []
    for i in range(REQUESTS_PER_LEVEL):
        path, method = ENDPOINTS[i % len(ENDPOINTS)]
        tasks.append((path, method))

    latencies = []
    statuses = Counter()
    errors = Counter()
    ok_count = 0
    fail_count = 0

    def worker(args):
        path, method = args
        # Each thread gets its own session via thread-local pool
        return do_request(tls_session(), path, method)

    # Thread-local sessions for connection reuse
    tls = threading.local()

    def tls_session():
        if not hasattr(tls, "session"):
            tls.session = requests.Session()
            tls.session.headers.update({"User-Agent": "stress-test/1.0"})
        return tls.session

    start = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = [pool.submit(worker, t) for t in tasks]
        for fut in concurrent.futures.as_completed(futures):
            r = fut.result()
            latencies.append(r["elapsed"])
            statuses[r["status"]] += 1
            if r["ok"]:
                ok_count += 1
            else:
                fail_count += 1
                if r["error"]:
                    errors[r["error"]] += 1
    wall = time.perf_counter() - start

    return {
        "concurrency": concurrency,
        "total": REQUESTS_PER_LEVEL,
        "ok": ok_count,
        "fail": fail_count,
        "wall": wall,
        "rps": REQUESTS_PER_LEVEL / wall if wall > 0 else 0,
        "latencies": latencies,
        "statuses": statuses,
        "errors": errors,
    }


def print_result(r):
    c = r["concurrency"]
    lats = r["latencies"]
    p50 = percentile(lats, 50) * 1000
    p75 = percentile(lats, 75) * 1000
    p90 = percentile(lats, 90) * 1000
    p95 = percentile(lats, 95) * 1000
    p99 = percentile(lats, 99) * 1000
    avg = statistics.mean(lats) * 1000 if lats else 0
    mn = min(lats) * 1000 if lats else 0
    mx = max(lats) * 1000 if lats else 0
    err_rate = (r["fail"] / r["total"]) * 100 if r["total"] else 0

    print(f"\n  Concurrency {c:>4}  ·  {r['total']} requests in {r['wall']:.2f}s")
    print(f"    Throughput   : {r['rps']:.1f} req/s")
    print(f"    Success rate : {r['ok']}/{r['total']} ({100 - err_rate:.1f}%)")
    print(f"    Latency (ms) : avg {avg:.0f} | min {mn:.0f} | "
          f"p50 {p50:.0f} | p75 {p75:.0f} | p90 {p90:.0f} | "
          f"p95 {p95:.0f} | p99 {p99:.0f} | max {mx:.0f}")
    status_str = ", ".join(f"{k}:{v}" for k, v in sorted(r["statuses"].items()))
    print(f"    Status codes : {status_str}")
    if r["errors"]:
        err_str = ", ".join(f"{k}:{v}" for k, v in r["errors"].items())
        print(f"    Errors       : {err_str}")


all_results = []
for level in LEVELS:
    print(f"\n>>> Running concurrency level {level} ...", flush=True)
    r = run_level(level)
    all_results.append(r)
    print_result(r)
    # Brief pause between levels to let the server settle
    time.sleep(1)

# Summary
print("\n" + "=" * 78)
print("  SUMMARY")
print("=" * 78)
print(f"  {'Conc':>5}  {'Req/s':>8}  {'Avg ms':>7}  {'p95 ms':>7}  "
      f"{'p99 ms':>7}  {'Errors':>7}  {'Err%':>6}")
print("  " + "-" * 60)
for r in all_results:
    lats = r["latencies"]
    avg = statistics.mean(lats) * 1000 if lats else 0
    p95 = percentile(lats, 95) * 1000
    p99 = percentile(lats, 99) * 1000
    err_pct = (r["fail"] / r["total"]) * 100 if r["total"] else 0
    print(f"  {r['concurrency']:>5}  {r['rps']:>8.1f}  {avg:>7.0f}  "
          f"{p95:>7.0f}  {p99:>7.0f}  {r['fail']:>7}  {err_pct:>5.1f}%")

print("\n  Done.")
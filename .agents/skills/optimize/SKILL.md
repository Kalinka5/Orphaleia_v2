---
name: optimize
description: Profile and improve performance in FastAPI and React applications using measured evidence while preserving visual quality, animations, accessibility, and behavior. Use for slow pages, APIs, interactions, bundles, payloads, database queries, Core Web Vitals, or performance regressions; do not use for speculative cleanup without a measurable performance goal.
metadata:
  short-description: Measure and optimize FastAPI + React
---

# Optimize

Find and fix the largest verified bottleneck in the user's FastAPI/React journey. Performance work is successful only when a comparable before/after measurement improves and the product still looks and behaves as intended.

## Non-negotiable constraints

- Measure before changing performance-sensitive code. If no baseline exists, collect one or add lightweight instrumentation first.
- Preserve visual design, content quality, responsive behavior, accessibility, and functional behavior.
- Preserve intentional animations and transitions. Improve their implementation or scheduling; do not delete, shorten beyond recognition, or replace them with static UI merely to improve a score unless the user explicitly approves that tradeoff.
- Respect `prefers-reduced-motion` without treating it as the default experience.
- Do not reduce image fidelity, visible detail, result quality, or useful data merely to make a metric look better. Use appropriate formats, sizing, caching, streaming, and loading priority instead.
- Optimize the slowest verified layer first. Do not scatter unrelated micro-optimizations across the stack.
- Prefer small, reviewable changes whose effect can be isolated. Balance gains against readability, correctness, memory use, cache invalidation complexity, and operational cost.
- Never claim an improvement from code inspection alone.

## Establish the preservation contract

Before implementation, record the parts of the affected journey that must remain stable:

- representative viewport screenshots or visual snapshots;
- animation inventory, including triggers, duration/easing, sequence, and scroll or interaction behavior;
- critical user-flow assertions and accessibility behavior;
- response shape and semantic content;
- relevant browser, device, dataset, and network conditions.

If the repository already has screenshot, component, integration, or end-to-end tests, extend those instead of inventing a parallel system. A performance change fails verification if it introduces visible regression, animation loss, layout shift, stale behavior, or incorrect data.

## Workflow

### 1. Define the journey, metric, and test conditions

Identify one concrete slow journey and its user-visible symptom. Choose metrics that match it:

- navigation or first view: LCP, TTFB, critical request chain, transferred bytes, hydration/main-thread time;
- interaction: INP, event-handler duration, render/commit time, long tasks;
- API: p50/p95/p99 latency, query count/time, serialization time, payload bytes, RPS, error rate;
- repeated visit: cache hit rate, revalidation time, transferred bytes;
- stability: CLS, dropped animation frames, memory growth.

Record environment, dataset size, cache state, number of runs, and throttling. Compare like with like. Treat LCP <2.5 s, INP <200 ms, and CLS <0.1 as useful defaults, not substitutes for a project-specific target.

### 2. Instrument the full request path

Decompose the journey rather than guessing:

```text
input/navigation -> network queue/download -> API middleware/route
-> service/DB/external I/O -> serialization -> React fetch/state
-> render/commit/layout/paint -> animation frames
```

Use the least invasive tool that can distinguish the layers. Examples include browser Network and Performance traces, React Profiler, Lighthouse in a controlled run, Server-Timing, structured route/query timing, SQLAlchemy query logging, `EXPLAIN (ANALYZE, BUFFERS)` in a safe environment, `py-spy`/`cProfile`, and k6 or Locust. Production profiling must be low-overhead and authorized.

### 3. Identify the bottleneck from evidence

State which span dominates the total time and cite the measurement. Verify suspected code with a trace, query plan, render profile, bundle report, or controlled experiment. Distinguish CPU, I/O wait, lock/contention, network transfer, cache miss, browser rendering, and third-party work.

Rank candidate changes by expected user impact, confidence in the evidence, implementation risk, and maintenance cost. Fix one dominant cause first.

### 4. Implement the smallest targeted fix

Keep observability sufficient to attribute the result. Read [references/fastapi-react-playbook.md](references/fastapi-react-playbook.md) before implementing or proposing detailed stack-specific changes. Select tactics only after the evidence points to their layer.

### 5. Re-measure and check regressions

Repeat the same test conditions across multiple runs and report distributions rather than a best run. Compare before/after values, absolute and percentage change, variance, and any tradeoffs.

Then verify:

- visual snapshots and responsive layouts;
- animation presence, sequencing, frame consistency, and reduced-motion behavior;
- accessibility and critical user flows;
- API correctness, cache invalidation, authorization boundaries, and data freshness;
- error rate, CPU, memory, database load, and bundle/payload changes.

If the metric does not improve beyond normal variance, revert or revise the hypothesis. Do not stack more speculative changes on top.

## Decision rules

- Do not convert `async def` to another style or add thread offloading until a trace proves blocking work affects the event loop.
- Do not add an index without inspecting the query shape and plan; account for write amplification and index size.
- Do not add caching without defining key scope, freshness, invalidation, authorization isolation, and failure behavior.
- Do not add memoization merely because a component re-renders; confirm the render is expensive and dependencies are stable.
- Do not virtualize a list based on item count alone; confirm DOM, layout, or render cost is material and preserve focus, screen-reader, find-in-page, and scroll behavior.
- Do not lazy-load the LCP image or other immediately visible critical content.
- Do not blanket-apply `will-change`, preload, or high fetch priority. Each consumes finite browser resources.
- Avoid changing several layers in one benchmark unless the user explicitly wants a combined intervention and attribution is still possible.

## Required response shape

Lead with the measured outcome. When some data is unavailable, label it as missing and give the exact measurement needed; do not invent values.

## Performance Analysis

### Current State

- Journey and layer
- Baseline metric, conditions, and target

### Bottleneck Identified

- Dominant span or resource

### Root Cause

- Profiling evidence and rejected assumptions

### Recommended Fix

- Targeted strategy and tradeoffs

### Implementation

- Focused code changes and preservation safeguards

### Verification

- Comparable before/after results
- Visual, animation, functional, accessibility, and resource regressions checked


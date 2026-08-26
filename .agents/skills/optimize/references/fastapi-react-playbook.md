# FastAPI + React performance playbook

Read this reference only after measurement identifies the relevant layer. These are hypotheses to test, not a checklist to apply wholesale.

## Network and delivery

- Inspect the critical request chain, connection timing, compression, cache status, payload size, and unused response fields.
- Prefer HTTP caching with deliberate `Cache-Control`, validators such as `ETag`, and correct `Vary` behavior. Keep personalized responses private and prevent cache-key data leaks.
- Enable response compression only after measuring representative payloads and CPU cost. Small or already-compressed bodies often do not benefit.
- Use modern images sized for their rendered slot with explicit dimensions or `aspect-ratio`. Preserve source quality; generate responsive variants rather than applying an indiscriminate low-quality setting.
- Preload or raise fetch priority only for verified critical resources such as the actual LCP image. Lazy-load below-the-fold media while preserving layout dimensions and reveal behavior.
- Reduce JSON or JavaScript bytes when transfer or parse time is material. Prefer pagination, field-specific endpoint shapes, and route-level splitting over silently removing useful content.

## FastAPI and Python

### Event loop and I/O

- Trace blocking duration before changing endpoint style. Move unavoidable blocking calls to a bounded worker thread/process, use an async client, or use a synchronous route when appropriate.
- Reuse configured HTTP/database connection pools. Measure pool wait, timeouts, and concurrency before increasing limits.
- Avoid unbounded fan-out with `gather`; use concurrency limits and cancellation/timeout behavior.
- For CPU-bound work, measure whether a process worker, job queue, precomputation, or algorithmic change is appropriate. More event-loop concurrency will not fix CPU saturation.

### SQLAlchemy and database

- Count queries and measure their time for the exact endpoint and representative data.
- Fix confirmed N+1 access with a suitable loader strategy (`selectinload`, `joinedload`, or an explicit projection), accounting for row multiplication and memory.
- Fetch only needed columns for hot read paths when object construction or transfer is significant. Avoid creating partially loaded ORM objects that later trigger hidden queries.
- Inspect filtered, joined, and ordered columns with an actual query plan before adding composite or covering indexes. Match index column order to the real predicate and sort pattern.
- Prefer keyset/cursor pagination over deep offsets when the measured workload shows offset cost and API semantics allow it.
- Keep transactions short. Profile lock waits separately from query execution.

### Serialization and response work

- Separate database time, model validation, serialization, and response transfer in traces.
- Use current supported Pydantic/FastAPI serialization paths first. Consider `ORJSONResponse`, direct encoders, or response-model changes only when serialization is a measured bottleneck and output correctness remains tested.
- Stream only when progressive consumption provides real benefit. Streaming can complicate error handling, compression, caching, and observability.
- Keep compression, CORS, auth, logging, and tracing middleware overhead visible in route timing.

## React and browser

### Data fetching

- First look for request waterfalls, duplicate requests, cache misses, serial dependencies, and over-fetching.
- Use the application's existing query/cache layer. Add TanStack Query or SWR only when its deduplication, caching, and revalidation value justifies a dependency and migration.
- Define query keys, stale time, retention, invalidation, optimistic-update rollback, and authorization boundaries explicitly.
- Start independent requests together and move fetches earlier when traces show a waterfall. Do not prefetch large or unlikely paths without a budget.

### Rendering and interaction

- Use React Profiler and browser traces to distinguish JavaScript execution, React render/commit, style/layout, paint, and third-party work.
- Move state closer to the components that consume it when broad invalidation is proven. Split expensive contexts or subscribe to smaller slices.
- Apply `memo`, `useMemo`, and `useCallback` only when profiling shows avoidable expensive work; include comparison and memory cost in the decision.
- Defer non-urgent state with transitions when it improves interaction latency without allowing stale or confusing feedback.
- Virtualize only when large DOM/layout cost is measured. Preserve keyboard navigation, focus restoration, accessible counts, dynamic row measurement, scroll anchoring, and test reliability.
- Move heavy pure computation off the main thread only when transfer/serialization overhead is lower than the measured blocking cost.

### Bundle and startup

- Generate a bundle report before splitting. Target large route-exclusive modules, optional editors/charts, locale packs, and accidental barrel-import expansion.
- Use route or feature-level dynamic imports with stable, designed loading states. Do not split tiny modules into excessive requests.
- Confirm tree-shaking and production build mode. Inspect duplicate packages and oversized polyfills before replacing libraries.
- Keep critical above-the-fold content and the initial interaction path available without unnecessary suspense waterfalls.

## Motion without visual regression

- Preserve the motion design's trigger, duration, easing, stagger, direction, and visual endpoint unless the user requests a redesign.
- Prefer compositor-friendly `transform` and `opacity` when they produce the same visual result. Measure because filters, masks, large layers, and overdraw can still be costly.
- Batch DOM reads and writes; avoid layout reads inside per-frame update loops. Cache stable geometry and recompute it on the correct resize/content events.
- Drive visual animation with `requestAnimationFrame` or the platform animation system rather than timer loops.
- Scope scroll listeners, use passive listeners when semantically safe, and reduce callback work. Test actual scroll-linked animation timing after any throttling.
- Use `will-change` shortly before expensive animation and remove it afterward when practical. Excess persistent layers can raise memory and raster cost.
- Pause offscreen or hidden continuous animation when doing so is visually indistinguishable; resume without phase jumps or lost state.
- Keep entrance animations coordinated with image/font readiness to avoid flashes, layout shifts, or elements animating from incorrect geometry.
- Test on a representative lower-powered device and inspect long frames, raster/paint cost, layer count, and memory—not only average desktop FPS.

## Benchmark discipline

- Warm up runtimes and connections, but report cold and warm behavior separately when both matter.
- Use representative dataset sizes and concurrent users. A fast empty database is not evidence for production behavior.
- Run enough samples to see variance; report median plus tail latency or relevant percentiles.
- Change one causal factor at a time when possible. Preserve raw traces, query plans, or benchmark commands so results are reproducible.
- Prefer a user-centric metric improvement over an isolated microbenchmark that does not affect the journey.


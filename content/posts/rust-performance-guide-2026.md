+++
title = "The Rust Performance Guide for 2026: What Makes Rust Fast"
date = 2026-07-14
description = "What actually makes Rust fast: zero-cost abstractions, real 5.9x and 78x optimization case studies, current SIMD support, and where C++ still wins."
[extra]
author = "Bob Peters"
toc_not_generate = true
+++

Every few months "rust vs c++ performance" trends again, usually attached to a synthetic microbenchmark that proves nothing about how either language performs in a real system. The honest answer is less exciting than a benchmark chart: both compile through LLVM, both give you manual control over memory layout, and in the vast majority of workloads the two land within noise of each other. The interesting question isn't which language is faster in the abstract. It's what specific properties of Rust let you get C++-level performance without C++'s failure modes, and where C++ still has an edge worth knowing about.

<!-- more -->

# Why Rust Can Match C++ in the First Place

Rust's performance case rests on three things that are true regardless of which specific micro-benchmark you pick:

- **Zero-cost abstractions.** Iterators, generics, and closures compile down to the same machine code you'd write by hand in most cases. The abstraction exists at compile time, not runtime.
- **No garbage collector.** Memory is freed deterministically when an owner goes out of scope. There's no GC pause to reason about, and no reference-counting overhead unless you explicitly opt into `Rc`/`Arc`.
- **The same backend.** `rustc` and `clang` both lower to LLVM IR. Once you're past the front end, the optimizer doing instruction selection, vectorization, and inlining is the same piece of software either way.

None of this guarantees Rust code is fast. It guarantees Rust doesn't force you to pay for safety at runtime, which means the ceiling is the same as C++. Whether you hit that ceiling is a function of your code, not the language.

# Two Real Optimization Stories, With Real Numbers

Benchmark game results are useful but abstract. What's more instructive is what happens when a real production crate gets a serious optimization pass, because the *type* of win tells you where to look in your own code.

<a href="https://rust-trends.com/newsletter/bun-ships-its-rust-migration-as-the-community-convenes-in-utrecht/" target="_blank">Rust Trends #78</a> covered a 5.9× speedup in `image-rs`'s `fast_blur` function that came from exactly two changes: replacing floating-point arithmetic with integer accumulators, and replacing integer division with reciprocal multiplication (the Granlund-Montgomery trick). No rewrite, no unsafe code, no new data structures. Just arithmetic that matches what the hardware is actually good at. Because image-rs is a transitive dependency across a large slice of the Rust image-processing ecosystem, that improvement shipped to downstream users who changed nothing.

<a href="https://rust-trends.com/newsletter/rust-crosses-the-chasm/" target="_blank">Rust Trends #76</a> covered a more dramatic case: the Matrix Rust SDK's room list was taking up to five minutes to render. The root cause wasn't the sorting algorithm, it was data layout. The sort cloned 144-byte `LatestEventValue` objects and acquired a lock 322,042 times per pass. The fix was a 64-byte `RoomListItem` struct, populated once before the sort ran, that fit in L1 cache and needed no lock access during the sort itself. Result: 53ms down to 0.676ms, an 78× improvement, from a data-oriented redesign rather than a smarter algorithm.

**Key insight:** in both cases the win came from understanding what the hardware was doing (cache lines, integer vs. float ALU paths, lock contention) not from a language feature. Rust made the fix possible to ship safely; it didn't find the fix for you.

# SIMD in Rust: Where Things Stand

For workloads that are genuinely vectorization-bound, Rust gives you three tiers, in order of how much control you trade for portability:

- **Auto-vectorization.** LLVM will vectorize straightforward loops over slices without you doing anything, the same as it does for equivalent C++. Check the assembly before assuming it worked.
- **Explicit intrinsics via `core::arch`.** Stable, and the same AVX2/NEON/SSE intrinsics you'd call from C++, just with Rust's type system wrapped around them.
- **Portable SIMD.** The `std::simd` API gives you a single portable vector type that lowers to the right intrinsics per target, but it has remained nightly-only for a long time. For stable-toolchain projects, crates like `wide` and `pulp` fill the same gap today.

None of this is unique to Rust, C++ has the equivalent tiers with intrinsics headers and libraries like Highway. The difference is that Rust's borrow checker catches the aliasing bugs that make hand-written SIMD code miserable to debug in C++, at compile time, before you've spent an afternoon in a debugger.

# Where C++ Still Has an Edge

It's worth being honest about this rather than pretending Rust has already won everywhere:

- **Mature numerical libraries.** BLAS, MKL, and Eigen have decades of tuning behind them. Rust's FFI story for calling into them is fine, but you're calling C++ (or Fortran) to get there, not replacing it.
- **Template metaprogramming depth.** C++ templates, for all their compile-time pain, support some compile-time computation patterns that Rust's const generics and macro system don't yet match.
- **FFI boundary cost.** If your hot path repeatedly crosses between Rust and a C++ codebase, you can lose more to the boundary than either language would cost you natively. This matters for gradual migrations more than greenfield projects.

# Memory Safety Is a Performance Property Too

It's tempting to treat memory safety and performance as a tradeoff Rust makes on your behalf. In practice, safety at compile time is what lets you attempt aggressive optimizations you'd be too nervous to try in unchecked C++. The Matrix SDK case above is a good example: restructuring hot-path data layout is exactly the kind of change that introduces use-after-free and data-race bugs in C++ if done carelessly. In Rust, the borrow checker rejects the incorrect version before it compiles, which means the optimization gets attempted and shipped instead of left on the table as too risky.

# The Practical Guide

If you're deciding how to approach performance work in a Rust codebase in 2026, the order of operations that actually pays off is:

1. Profile first. Both of the case studies above started with a profiler, not a guess.
2. Look for data layout and allocation patterns before reaching for SIMD or `unsafe`. The 78× Matrix SDK win came from cache-friendly structs, not vector instructions.
3. Check whether LLVM already auto-vectorized your loop before hand-writing intrinsics.
4. Reach for `core::arch` or a portable SIMD crate only once profiling confirms the bottleneck is genuinely a vectorizable numeric loop.
5. When crossing an FFI boundary into C++ code, measure the boundary cost itself, not just the two sides independently.

Rust vs. C++ performance was never really the question. The question is whether your code respects what the hardware is doing, and Rust's compile-time guarantees make it safer to find out.

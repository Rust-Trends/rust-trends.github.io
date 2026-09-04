+++
title = "Rust Async Runtimes Compared: Tokio vs Smol in 2026"
date = 2026-09-04
description = "Real crates.io download data on Tokio vs smol vs async-std, why async-std was discontinued, and how to pick a runtime for a new Rust project in 2026."
[extra]
author = "Bob Peters"
toc_not_generate = true
+++

For years, "which async runtime" was a real fork in the road for a new Rust project: Tokio, async-std, or something smaller. That question has an asterisk on it now. async-std's own README says the project "has been discontinued," and pulling live numbers from crates.io shows exactly how lopsided the field has become since.

<!-- more -->

## The Numbers

Crates.io's API exposes download counts directly, so this isn't secondhand. As of this writing:

- **Tokio**: 935,996,538 total downloads, 216,230,632 in the recent window
- **async-std**: 91,278,477 total, 9,881,773 recent, despite being discontinued
- **smol**: 21,920,856 total, 4,218,397 recent, its official successor
- **glommio**: 160,315 total, 23,839 recent, a thread-per-core niche runtime

Tokio outpulls smol by roughly 44x on recent downloads. That's not close, and it hasn't been close for a while. The more interesting number is the second one: a runtime whose own maintainers say to stop using it is still pulling more than double the downloads of the project built to replace it. That gap is transitive dependencies, not developers actively choosing async-std today. Somewhere in a lot of dependency trees, a crate two or three levels down still pulls in async-std, and whoever owns that `Cargo.lock` hasn't noticed yet.

## What Happened to async-std

async-std shipped in 2019 as a deliberate mirror of the standard library's API, built by Stjepan Glavina and collaborators to prove that async Rust didn't have to look like a different language. It worked, for a while it was a genuine second option alongside Tokio, with its own ecosystem of HTTP clients and web frameworks like `surf` and `tide`.

The project's GitHub README now states it plainly:

> "async-std has been discontinued; use smol instead."

The maintainers' own explanation is that async-std succeeded at its original goal, demonstrating that a std-mirroring async library was viable, and that `smol`, which grew out of the same team's work, became the better vehicle for carrying that idea forward rather than maintaining two overlapping projects. RustSec made it official with <a href="https://rustsec.org/advisories/RUSTSEC-2025-0052.html" target="_blank">RUSTSEC-2025-0052</a>, issued August 27, 2025, flagging async-std itself as unmaintained with no patched version coming. If `cargo audit` is in your CI and a dependency still pulls async-std, this is the advisory that will fire.

**Key insight:** "unmaintained" in the RustSec sense doesn't mean broken today. async-std still compiles and runs fine. It means no one is fixing what breaks tomorrow, which is a different kind of risk than a build failure, and one that's easy to ignore until it isn't.

## Tokio: The Default, and Why

Tokio's download lead isn't just inertia. It ships as more than an executor: `tokio::fs`, `tokio::net`, `tokio::process`, `tokio::signal`, plus a first-party ecosystem (`hyper`, `tonic`, `axum`) that assumes Tokio underneath. That breadth is also the cost. Pulling in Tokio's full feature set means a real compile-time and dependency-count tax, somewhere around 50 transitive crates against smol's roughly 5, which shows up on every `cargo build` in CI.

```rust
#[tokio::main]
async fn main() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:8080").await.unwrap();
    // Tokio's ecosystem (hyper, axum, tonic) is written against this runtime specifically
}
```

For anything that needs to talk to that ecosystem, a web server, a gRPC service, most production infrastructure work, Tokio isn't really a choice you're making so much as a dependency your other dependencies already made for you. <a href="https://rust-trends.com/newsletter/production-rust-internet-scale/" target="_blank">Rust Trends #71</a> covered a concrete version of this at Cloudflare: Pingora, the Rust proxy that replaced nginx across their edge network, leans on Tokio for its async I/O rather than rolling a custom executor, because the ecosystem around it (TLS, connection pooling, metrics) already existed. Tokio's own scope keeps expanding on the strength of that same network effect: <a href="https://rust-trends.com/newsletter/rust-climbs-the-stack/" target="_blank">Rust Trends #79</a> covered Topcoat, a full-stack web framework the Tokio team shipped to build server-rendered, async-native apps without WebAssembly in the browser, another layer stacked directly on top of the runtime rather than beside it.

## Smol: Small on Purpose

Smol takes the opposite bet: no macros, a minimal core, and a design goal of staying embeddable in a library without forcing that library's users onto a specific runtime.

```rust
fn main() {
    smol::block_on(async {
        let listener = smol::net::TcpListener::bind("127.0.0.1:8080").await.unwrap();
        // no runtime-specific ecosystem assumption baked in
    });
}
```

That's the real use case for smol in 2026: not "smaller Tokio," but the right choice when you're writing a library and don't want to force a 50-crate dependency tree onto everyone who imports it. Applications with a hard dependency on the Tokio-specific ecosystem don't gain much from switching, the ecosystem gap is the actual cost, not the runtime itself.

## Where glommio Fits

Glommio is worth naming even at 160,315 total downloads, because it solves a problem neither Tokio nor smol targets directly: thread-per-core execution on Linux via `io_uring`, with each core owning its own non-shared executor and no cross-thread synchronization at all. That model earns real throughput on databases, proxies, and message brokers that can partition work by core, at the cost of only running on Linux and requiring an execution model most codebases aren't structured for. It's a build-a-database choice, not a default.

## Choosing One

- **Building a web service, gRPC API, or anything touching `axum`/`tonic`/`hyper`**: Tokio. The ecosystem decision was already made upstream.
- **Writing a library that shouldn't dictate a runtime to its callers**: smol, or the runtime-agnostic `futures`/`async-io` primitives underneath it.
- **A database, proxy, or broker that can partition work per-CPU-core on Linux**: glommio is worth the narrower fit.
- **Anything still depending on async-std directly**: migrate. Not urgently, in the sense that nothing breaks this week, but the RustSec advisory is a documented finding your security scanning will keep surfacing until you do.

The field didn't get more crowded over the last few years, it got smaller and more decided. That's a genuinely easier starting point than the three-way split of 2020, even if the reason it simplified was one project folding.

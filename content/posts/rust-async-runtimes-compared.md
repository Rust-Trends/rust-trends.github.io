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
- **smol**: 21,920,856 total, 4,218,397 recent, its recommended replacement
- **glommio**: 160,315 total, 23,839 recent, a thread-per-core niche runtime

Tokio outpulls smol by roughly 51x on recent downloads, and about 43x on total downloads. That's not close, and it hasn't been close for a while. The more interesting number is the second one: a runtime whose own maintainers say to stop using it is still pulling more than double smol's recent downloads. Some of that is likely transitive, a crate two or three levels down still pulling in async-std rather than developers choosing it directly today. But crates.io download counts can't separate direct choices from transitive resolution, CI, or mirrors, so treat the figure as a coarse signal rather than proof.

## What Happened to async-std

async-std shipped in 2019 as a deliberate mirror of the standard library's API, built by Stjepan Glavina in collaboration with Yoshua Wuyts to prove that async Rust didn't have to look like a different language. It worked, for a while it was a genuine second option alongside Tokio, with its own ecosystem of HTTP clients and web frameworks like `surf` and `tide`.

The project's GitHub README now states it plainly:

> "async-std has been discontinued; use smol instead."

The maintainers' own explanation is that async-std succeeded at its original goal, demonstrating that a std-mirroring async library was viable, and that `smol`, which grew out of the same team's work, became the better vehicle for carrying that idea forward rather than maintaining two overlapping projects. RustSec made it official with <a href="https://rustsec.org/advisories/RUSTSEC-2025-0052.html" target="_blank">RUSTSEC-2025-0052</a>, issued August 27, 2025, an informational advisory flagging async-std as unmaintained with no patched version coming. If `cargo audit` runs in your CI and a dependency still pulls async-std, this is what it will surface, though unmaintained findings are warnings unless you configure CI to deny them.

**Key insight:** "unmaintained" in the RustSec sense doesn't mean broken today. async-std still compiles and runs fine. It means no one is fixing what breaks tomorrow, which is a different kind of risk than a build failure, and one that's easy to ignore until it isn't.

## Tokio: The Default, and Why

Tokio's download lead isn't just inertia. It ships as more than an executor: networking, filesystem, process, signal, synchronization, and timer facilities (`tokio::net`, `tokio::fs`, `tokio::process`, `tokio::signal`, and more), plus a surrounding ecosystem tied to it in varying degrees. `axum`, under the tokio-rs organization, is built directly on Tokio; `tonic` and `hyper`, both under the hyperium organization, are more independent, and `hyper` in particular exposes its own executor, timer, and I/O abstractions (`hyper::rt`) so it can run on other runtimes, even though most deployments pair it with Tokio. That breadth is also the cost. Tokio enables no features by default; its `full` set turns on APIs and optional dependencies a smaller configuration doesn't need, and the exact dependency count varies with the features you enable, your target platform, and your Cargo version. Rather than trusting a fixed number, compare the feature sets you actually need and clean-build times on your target, since the tax mostly shows up on clean or uncached CI builds.

```rust
#[tokio::main]
async fn main() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:8080").await.unwrap();
    // axum is built directly on Tokio; tonic and hyper usually run on it too
}
```

For anything that needs to talk to that ecosystem, a web server, a gRPC service, most production infrastructure work, Tokio isn't really a choice you're making so much as a dependency your other dependencies already made for you. <a href="https://rust-trends.com/newsletter/production-rust-internet-scale/" target="_blank">Rust Trends #71</a> covered a concrete version of this at Cloudflare: Pingora, the Rust proxy that handles traffic between Cloudflare and origin servers, is built on Tokio. In <a href="https://blog.cloudflare.com/how-we-built-pingora-the-proxy-that-connects-cloudflare-to-the-internet/" target="_blank">their own account</a>, the reasons were Tokio's multithreading, shared resources (connection pools in particular), and work stealing, not a ready-made surrounding ecosystem. Cloudflare in fact wrote its own HTTP implementation rather than adopting hyper, a reminder that leaning on a runtime and leaning on its ecosystem are separate decisions. Tokio's own scope keeps expanding on the strength of that same network effect: <a href="https://rust-trends.com/newsletter/rust-climbs-the-stack/" target="_blank">Rust Trends #79</a> covered Topcoat, an experimental full-stack web framework from the Tokio team for building server-rendered, async-native apps without WebAssembly in the browser, another layer stacked directly on top of the runtime rather than beside it.

## Smol: Small on Purpose

Smol takes the opposite bet: no macros, a minimal core, and component crates (`async-io`, `async-executor`, `blocking`) you can pull in piecemeal.

```rust
fn main() {
    smol::block_on(async {
        let listener = smol::net::TcpListener::bind("127.0.0.1:8080").await.unwrap();
        // note: smol::net and smol::block_on still tie this code to smol
    });
}
```

That's the real use case for smol in 2026: not "smaller Tokio," but a lighter-weight runtime whose components you can adopt piecemeal. For a genuinely runtime-neutral library, though, the more portable move is to expose plain `futures` and portable traits and let the caller bring the runtime, reaching for `smol::net` or smol's executor only when you specifically want smol's I/O. Applications with a hard dependency on the Tokio-specific ecosystem don't gain much from switching, the ecosystem gap is the actual cost, not the runtime itself.

## Where glommio Fits

Glommio is worth naming even at 160,315 total downloads, because it solves a problem neither Tokio nor smol targets directly: thread-per-core execution on Linux via `io_uring`. Each core normally owns a local executor, which reduces cross-thread coordination and task migration, though applications can still pass messages across executors through shared channels when they need to. That model earns real throughput on databases, proxies, and message brokers that can partition work by core, at the cost of only running on Linux (kernel 5.8 or newer) and requiring an execution model most codebases aren't structured for. It's a build-a-database choice, not a default.

## Choosing One

- **Building a web service, gRPC API, or anything touching `axum`/`tonic`/`hyper`**: Tokio. The ecosystem decision was already made upstream.
- **Writing a library that shouldn't dictate a runtime to its callers**: expose plain `futures` and portable traits and let the caller bring the runtime; reach for smol's `net`/executor components only when you specifically want smol's I/O.
- **A database, proxy, or broker that can partition work per-CPU-core on Linux**: glommio is worth the narrower fit.
- **Anything still depending on async-std directly**: migrate. Not urgently, in the sense that nothing breaks this week, but the RustSec advisory is a documented finding your security scanning will keep surfacing until you do.

The field didn't get more crowded over the last few years, it got smaller and more decided. That's a genuinely easier starting point than the three-way split of 2020, even if the reason it simplified was one project folding.

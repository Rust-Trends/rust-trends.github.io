+++
title = "Rust Async/Await Tutorial: What .await Actually Does"
date = 2026-10-06
description = "What Rust's async/await actually compiles to: the async fn state machine, why Futures are lazy, why you need a runtime, and three mistakes every newcomer hits."
[extra]
author = "Bob Peters"
toc_not_generate = true
+++

Most async/await tutorials teach the keywords and skip the mechanism. You learn to write `async fn` and sprinkle `.await` until it compiles, and it works, right up until it doesn't: a future that silently never runs, a compile error about `Send` you can't explain, a program that "hangs" for no visible reason. All three come from the same gap: not knowing what `async`/`await` actually compiles to.

<!-- more -->

## `async fn` Is a State Machine, Not a Thread

Writing `async fn` doesn't create a thread, and it doesn't run anything immediately. It builds a value.

```rust
async fn fetch_greeting() -> String {
    String::from("hello")
}
```

The compiler rewrites this into something close to:

```rust
fn fetch_greeting() -> impl Future<Output = String> {
    // a compiler-generated state machine, not a String
}
```

Calling `fetch_greeting()` doesn't run the body. It produces a `Future`, an inert value whose `poll` method the compiler generates from your function's body, with one state per `.await` point. Nothing in that struct does any work on its own.

```rust
#[tokio::main]
async fn main() {
    let greeting = fetch_greeting(); // nothing has run yet
    println!("{}", greeting.await); // this is what runs the body
}
```

**Key insight:** Rust's futures are lazy. Creating one allocates a state machine; it does no work until something polls it. This is why the compiler warns `unused implementer of Future that must be used` if you call an async function and never `.await` or `spawn` it, you built a value and threw it away unused.

## Why You Can't `.await` Without a Runtime

The `Future` trait in `std` defines exactly one required method:

```rust
fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output>;
```

`poll` returns `Poll::Ready(value)` when the future is done, or `Poll::Pending` when it's waiting on something, a socket, a timer, another future. The standard library ships this trait and nothing else. There is no code anywhere in `std` that calls `poll` for you. That's the job of an async runtime, Tokio being the overwhelming default in practice.

This is why `fn main()` can't be `async fn main()` without help: something has to call `poll` in a loop, park the thread when every future returns `Pending`, and wake back up when a timer fires or a socket becomes readable. `#[tokio::main]` is a macro that generates exactly that driver:

```rust
fn main() {
    tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(async {
            // your original async main body
        });
}
```

`.await` itself compiles to a loop around `poll`: if the result is `Pending`, it registers a waker with the runtime and yields control back, so other tasks can run on the same thread while this one is parked. That's the entire concurrency model, one thread cooperatively switching between futures at `.await` points, not preemptively switching like OS threads do.

## A Worked Example: Concurrent, Not Parallel by Default

```rust
use tokio::time::{sleep, Duration};

async fn task(id: u32, delay_ms: u64) -> u32 {
    sleep(Duration::from_millis(delay_ms)).await;
    println!("task {id} done");
    id
}

#[tokio::main]
async fn main() {
    // Sequential: each .await blocks the next line until it resolves. ~300ms total.
    let a = task(1, 100).await;
    let b = task(2, 100).await;
    let c = task(3, 100).await;

    // Concurrent: all three futures are polled together on this task. ~100ms total.
    let (x, y, z) = tokio::join!(task(4, 100), task(5, 100), task(6, 100));

    println!("{a} {b} {c} {x} {y} {z}");
}
```

`.await` on its own gives you sequencing, not concurrency, each call runs to completion before the next one starts. `tokio::join!` is what actually runs multiple futures together on the current task, polling each one and advancing whichever is ready. That distinction is the single most common surprise for people coming from `async`/`await` in other languages, where awaiting a promise doesn't necessarily imply the same sequential execution model.

## Three Mistakes That Catch Every Newcomer

**1. Calling an async function without `.await` or `spawn`.** `fetch_greeting();` on its own does nothing, you've built a future and discarded it. The compiler's unused-future warning exists precisely because this is easy to do by accident, especially when refactoring a synchronous function into an async one and missing a call site.

**2. Blocking inside an async function.** `std::thread::sleep` or a synchronous file read inside an `async fn` blocks the OS thread the runtime is using to poll every other task scheduled on it, there's no preemption to save you. <a href="https://rust-trends.com/newsletter/nvidia-brings-rust-to-the-gpu-kernel/" target="_blank">Rust Trends #83</a> covered a set of production-tested principles for exactly this class of problem: schedule latency, the gap between a task being ready and actually getting polled, is often the most useful single metric for diagnosing it. Use `tokio::time::sleep` instead of `std::thread::sleep`, and `tokio::task::spawn_blocking` for genuinely blocking work like synchronous I/O or CPU-heavy loops.

**3. Fighting `Send` bounds across `.await` points.** A multi-threaded runtime can move a suspended task to a different worker thread at any `.await` point, which means everything held across an `.await`, including a non-`Send` type like `Rc<T>` or a `MutexGuard` from `std::sync`, has to be `Send`. The fix is usually `Arc` instead of `Rc`, and `tokio::sync::Mutex` instead of `std::sync::Mutex` for anything held across an await, or restructuring so the guard is dropped before the `.await` line.

## Where This Goes Next

Async/await syntax is the easy 80%, a readable way to write a state machine without writing the state machine by hand. The hard 20% is runtime behavior: which executor you're on, how tasks get scheduled, and what happens when work doesn't fit the cooperative model. Tokio's own framework choices keep extending that same foundation further up the stack: <a href="https://rust-trends.com/newsletter/rust-climbs-the-stack/" target="_blank">Rust Trends #79</a> covered Topcoat, a full-stack, server-rendered web framework from the Tokio team built directly on this task model, with no WebAssembly in the browser.

**Key insight:** `async`/`await` is syntax for building a `Future`, not a scheduling guarantee. The runtime decides when your code actually runs; your job is to make sure nothing you write blocks it from running anything else.

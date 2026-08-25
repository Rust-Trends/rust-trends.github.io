+++
title = "Rust vs C++ Memory Safety: What Actually Gets Prevented"
date = 2026-08-25
description = "Which memory bugs Rust catches at compile time that C++ does not, backed by real vulnerability data from Android and Microsoft."
[extra]
author = "Bob Peters"
toc_not_generate = true
+++

"Rust is memory safe" gets repeated so often it's stopped meaning anything specific. The useful version of the claim is narrower: a defined set of bug classes that compile in C++ and fail to compile in Rust, plus a defined set of bug classes neither language touches. This is a walk through both lists with actual code, not the abstract pitch.

<!-- more -->

# The Bug Classes Rust's Borrow Checker Eliminates

Four categories account for most memory-safety CVEs in C and C++ codebases: use-after-free, double-free, buffer overflows from unchecked bounds, and data races from unsynchronized concurrent access. Rust's ownership model rejects all four at compile time, not by adding runtime checks, but by making the invalid states unrepresentable in the type system.

Here's a use-after-free that compiles cleanly in C++:

```cpp
std::string* get_dangling() {
    std::string local = "temporary";
    return &local; // returns pointer to stack memory that's about to be freed
}
```

Nothing about this signature says the returned pointer is unsafe to use. It compiles, links, and runs, until the caller dereferences a pointer into memory that's already been reclaimed. The bug only shows up at runtime, if you're lucky enough to trigger it under a sanitizer.

The equivalent Rust function doesn't compile:

```rust
fn get_dangling() -> &String {
    let local = String::from("temporary");
    &local // error[E0106]: missing lifetime specifier
}
```

The compiler rejects this before you run anything, because the borrow checker tracks how long every reference is allowed to live relative to the data it points to. There's no version of this function that returns a reference to `local` and compiles, short of changing the function to return owned data instead. The bug class doesn't get caught early, it gets made impossible to express.

The same mechanism kills buffer overflows on the common path. Indexing a `Vec` or slice out of bounds in Rust panics immediately at the access site with a clear message, rather than reading or writing adjacent memory the way an unchecked C++ array access does. And Rust's ownership rules (one mutable reference or many immutable references, never both) are exactly the condition required for the compiler to prove a piece of data isn't being mutated from two threads at once, which is why safe Rust code can't produce a data race without going through `unsafe` or an explicitly-synchronized primitive like `Mutex`.

# The Data: This Isn't Theoretical

The claim holds up outside toy examples. <a href="https://rust-trends.com/newsletter/experimental-to-enterprise-rust-production/" target="_blank">Rust Trends #72</a> covered Google's Android Security team publishing hard numbers on this exact question: memory-safety vulnerabilities in Android's Rust code occur at a rate of 0.2 per million lines, versus roughly 1,000 per million lines in the codebase's C/C++ portions. That's not a rounding difference, it's a three-orders-of-magnitude gap, measured across a codebase large and old enough for the comparison to mean something.

Microsoft's internal data points the same direction: a decade of vulnerability analysis found that roughly 70% of the security bugs they patched originated in unsafe memory usage in C/C++ code, which is a large part of why Azure has been pushing Rust adoption for security-critical infrastructure. Neither data point is marketing. Both are organizations with enormous C/C++ estates who measured their own bug data and drew the obvious conclusion.

**Key insight:** these numbers aren't "Rust code has fewer bugs because Rust programmers are more careful." They're "the same category of bug becomes structurally harder to write," measured across large enough codebases that individual programmer skill washes out as a variable.

# Where the Guarantee Actually Ends

None of this makes the "Rust is just safe, full stop" framing accurate, and pretending otherwise undersells the real argument. Three carve-outs matter:

- **`unsafe` blocks opt back into C++'s rules.** Raw pointer dereferences, manual memory management, and FFI calls into C libraries all require an explicit `unsafe` block, and inside that block the compiler's guarantees stop applying. A large fraction of real-world Rust CVEs trace back to a small amount of `unsafe` code, often in a dependency, not to the safe majority of the codebase.
- **Compile-time safety isn't the only model.** <a href="https://rust-trends.com/newsletter/rust-climbs-the-stack/" target="_blank">Rust Trends #79</a> covered Zig creator Andrew Kelley's proposal for runtime-enforced memory safety via pointer provenance checks, explicitly framed as "actually memory safe (unlike borrow checking)." His argument is that Rust's guarantee only holds if you avoid `unsafe`, whereas a runtime model has no escape hatch, at the cost of a real performance penalty (his own estimate was 1x to 6x). It's a legitimate distinction: Rust trades a hole in the guarantee for zero runtime cost, other approaches trade the hole for a tax on every access.
- **Logic bugs and leaks are untouched.** Rust prevents a defined set of memory-safety bugs. It does nothing for reference cycles that leak memory (`Rc` cycles are a known footgun), deadlocks, or plain logic errors that produce wrong results without corrupting memory at all. "Memory safe" and "correct" are different properties, and Rust only claims the first one.

# What This Means in Practice

If you're deciding how much weight the "memory safe" argument should carry in a language choice, the honest version is: it eliminates a specific, historically expensive category of bugs (the Android and Microsoft numbers above are what "expensive" means in practice) at compile time, for free, in code that doesn't reach for `unsafe`. It doesn't eliminate bugs generally, and the guarantee is only as strong as how much `unsafe` and how many C-library FFI boundaries your dependency tree actually has. That's a narrower claim than the slogan, and it's also a stronger one, because it's the version you can actually check against a codebase.

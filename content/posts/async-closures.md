+++
title = "Rust’s Async Closures: A New Way to Handle Asynchronous Logic"
date = "2025-02-14"
slug = "Rust’s Async Closures"
description = "Discover how async closures in Rust (coming in Rust 1.85) will make handling asynchronous logic more ergonomic. Learn what closures are, why async closures matter, and see simple examples of how they improve Rust’s async experience."
+++

Rust’s upcoming async closures are an exciting feature set to land in **Rust 1.85**. If you’ve ever tried to write a closure inside an async function, you’ve likely hit a wall. Until now, closures couldn’t be async themselves, forcing developers to work around the limitation with named async functions. But with async closures, Rustaceans will finally get the closure they’ve been seeking!

## What Are Closures in Rust?

Closures in Rust are anonymous functions that can capture variables from their surrounding scope. They’re often used for short, throwaway functions, making code more concise and expressive. Closures in Rust can be assigned to variables, passed as arguments, and even return values.


### Example of a Basic Closure:

```rust
fn main() {
    let add_one = |x: i32| x + 1;
    println!("{}", add_one(5)); // Output: 6
}
```
Here, add_one is a closure that takes an i32 increments it with 1 and returns the resulting i32.


### Closures Capturing Variables:
```rust
fn main() {
    let multiplier = 3;
    let multiply = |x: i32| x * multiplier; // Capturing `multiplier`
    println!("{}", multiply(4)); // Output: 12
}
```
This closure captures multiplier from its environment.

## Why Do We Need Async Closures?
Previously, if you wanted to write an async function inside another function, you had to define it separately:

```rust
async fn fetch_data(url: &str) -> String {
    reqwest::get(url).await.unwrap().text().await.unwrap()
}

fn main() {
    let fetcher = |url: &str| fetch_data(url); // Not truly async
}
```
This is clunky! Async closures will allow a more natural syntax.

### Example: Using an Async Closure
```rust
fn main() {
    let fetcher = async |url: &str| reqwest::get(url).await.unwrap().text().await.unwrap();
}
```
Now fetcher is a true async closure that can be used inside async contexts seamlessly.


### Example: Using an Async Closure in Tokio
```rust
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    let delayed_print = async |msg: &str| {
        sleep(Duration::from_secs(2)).await;
        println!("{}", msg);
    };

    delayed_print("Hello, async closures!").await;
}
```
Here, we define an async closure that waits for two seconds before printing a message. Want to try it out? Here is a <a href="https://play.rust-lang.org/?version=beta&mode=debug&edition=2021&gist=7770a1e098415137296f767cbd3273fe" target="_blank">Rust playground link</a> to the code snippet. Note that for now Beta Rust is required to run async closures.


## What’s Next?
With Rust 1.85, async closures will make writing asynchronous code more ergonomic. They’ll be useful in scenarios like async iterators, event handling, and networking.


So, Rustaceans, are you ready to embrace async closures? They’re coming soon—probably faster than your coffee cools down!

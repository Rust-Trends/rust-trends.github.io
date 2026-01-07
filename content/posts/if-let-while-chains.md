+++
title = "Rust’s if/let While Chains: Cleaner Control Flow is Coming!"
date = "2025-02-14"
slug = "Rust’s if let While Chains"
description = "Rust’s upcoming if/let while chains will clean up control flow by eliminating unnecessary nesting. Explore how this feature simplifies conditional expressions and loops, making Rust code more readable and expressive."
+++

One of the long-awaited features in Rust is if/let while chains, and it’s finally on the way! This small but powerful change will make conditional expressions and loops more ergonomic, eliminating some of the verbosity that Rustaceans have had to deal with.

## What’s the Problem?

Currently, if you want to combine multiple conditions involving if let and while let, you have to nest them or write separate conditions, making the code harder to read.

For example, if you wanted to check whether an Option contains a value and another condition holds, you’d have to write:
```rust
fn main() {
    let some_option = Some(15);

    if let Some(x) = some_option {
        if x > 10 {
            println!("x is greater than 10!");
        }
    }
}
```
Or in a while loop with a game of blackjack:
```rust
fn main() {
    let deck = vec![5, 6, 10, 3, 2, 4]; // Example card values.
    let mut total = 0;
    let max = 21;

    let mut iter = deck.into_iter();

    while let Some(card) = iter.next() {
        // Check if drawing the next card would bust (exceed max).
        if total + card > max {
            break;
        }
        total += card;
        println!("Drew card: {} (total: {})", card, total);
    }

    println!("Final total: {}", total);
}
```
This indentation gets annoying fast!

## What’s Changing?

With if/let while chains, Rust will let you write conditions in a more natural way. Instead of nesting if let inside an if, you can chain them together like this:
```rust
#![feature(let_chains)] // Enable the feature
fn main() {
    let some_option = Some(15);

    if let Some(x) = some_option && x > 10 {
        println!("x is greater than 10!");
    }
}
```
Similarly, for while let:
```rust
#![feature(let_chains)] // Enable the feature
fn main() {
    let deck = vec![5, 6, 10, 3, 2, 4]; // Example card values.
    let mut total = 0;
    let max = 21;

    let mut iter = deck.into_iter();

    // The loop continues only if:
    // 1. A card is drawn (Some(card)), AND
    // 2. Adding the card does not exceed 21.
    while let Some(card) = iter.next() && total + card <= max {
        total += card;
        println!("Drew card: {} (total: {})", card, total);
    }

    println!("Final total: {}", total);
}
```
⚠ Note: These examples will only work once if/let while chains are stabilized! You can run it on the <a href="https://play.rust-lang.org/?version=nightly&mode=debug&edition=2021&gist=3d7d383082e42aa01f65b1444db56e3a" target="_blank">Rust Playground</a> if you select Rust version: Nightly.

This makes the intent much clearer and eliminates unnecessary nesting. Just what we need!

## Why Is This Useful?
 1.	__Cleaner Code__ – No more deep nesting just to check additional conditions.
 2.	__Better Readability__ – The logic is clearer at a glance.
 3.	__Improved Consistency__ – Other languages allow similar patterns, and Rust is catching up.


## Final Thoughts

Rust has always emphasized safety and clarity, but small ergonomic tweaks like if/let while chains help make code easier to write and read.

With this feature expected to land soon, you’ll be able to streamline your control flow—no hacks, no unnecessary nesting, just clean Rust.

Now, if only debugging borrow checker errors could be this easy… 😆

<br><br>

P.S. Previously, I had a while let chain example that was incorrect and didn’t function the same way as the code without this feature. Thanks to Günter’s keen eye, he pointed out the mistake—much appreciated!

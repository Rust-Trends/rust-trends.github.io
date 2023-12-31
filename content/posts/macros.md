+++
title = "Rust Macros Revealed!"
date = "2023-08-06"
slug = "Rust Macros Revealed"
description = "Delve into Rust macros' transformative potential. See how tools like 'cargo expand' unveil macro magic, illustrated with Actix Web & Tokio runtime. Simplify boilerplate and master Rust meta-programming."
+++
<img src="../../newsletter/23/transformers.webp" alt="Rust Macros Revealed!" style="display: block; margin-left: auto; margin-right: auto; width: 60%; border:0">

# Macros in Rust
In the world of programming, repetition is often seen as a bad thing. Rust macros provide a way to avoid repetitive code, allowing you to define reusable code templates. Unlike functions, macros don't operate on values; instead, they operate on the code itself.

Macros in Rust work like meta-programming. They are a way to define reusable chunks of code that get "expanded" or "transformed" into more detailed code at compile time. This is like giving the compiler a recipe to generate specific chunks of code on the fly.

For instance, you might have used the `println!()` macro. The `!` indicates it's a macro. With macros, you can achieve functionalities that functions can't offer, like variadic arguments or pattern-based code generation. Another example of a macros are expressions like `#[tokio::main]`, called an attribute macro.

## Why Use `cargo expand`?

When working with macros, you might wonder what the actual code generated by these macros looks like. This is where `cargo expand` comes in handy. It allows you to see the result of all the macro expansions, giving you a peek into the detailed, often boilerplate-heavy, code that gets generated.

## Using `cargo expand` with Your Code

Consider the simple [Actix Web server](https://actix.rs/) code provided below:

```rust
use actix_web::{web, App, HttpServer, Responder, HttpResponse};

async fn health_check() -> impl Responder {
   HttpResponse::Ok()
}

#[tokio::main]
async fn main() -> Result<(), std::io::Error> {
     HttpServer::new(|| {
        App::new()
            .route("/health_check", web::get().to(health_check))
    })
    .bind("127.0.0.1:8000")?
    .run()
    .await
}
```

Here, the `#[tokio::main]` is an attribute macro provided by the [Tokio crate](https://tokio.rs/). Tokio is an asynchronous runtime for the Rust programming language. It provides the building blocks needed for writing network applications. The attribute macro sets up the necessary boilerplate to run asynchronous code in the main function. But what does this boilerplate look like?

To find out, you'd first need to install [cargo expand](https://github.com/dtolnay/cargo-expand):

```bash
$ cargo install cargo-expand
```

Then, in the root of your Rust project, run:

```bash
$ cargo expand
```

The output will be the code after all macros, including `#[tokio::main]`, have been expanded. This "expanded" version will show you the underlying boilerplate introduced by the macro, revealing all the magic that happens behind the scenes.

```rust
#![feature(prelude_import)]
#[prelude_import]
use std::prelude::rust_2021::*;
#[macro_use]
extern crate std;
use actix_web::{web, App, HttpServer, Responder, HttpResponse};
async fn health_check() -> impl Responder {
    HttpResponse::Ok()
}
fn main() -> Result<(), std::io::Error> {
    let body = async {
        HttpServer::new(|| {
                App::new().route("/health_check", web::get().to(health_check))
            })
            .bind("127.0.0.1:8000")?
            .run()
            .await
    };
    #[allow(clippy::expect_used, clippy::diverging_sub_expression)]
    {
        return tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("Failed building the Runtime")
            .block_on(body);
    }
}
```
Let's break down the transformation that has occurred due to the #[tokio::main] macro:

1. **Async Block**: The entire async part of the original main function has been encapsulated inside an async block, and this block is assigned to the `body` variable:
```rust
let body = async { ... };
```
This `body` variable holds the asynchronous logic, but by itself, it doesn't execute anything. It merely describes the asynchronous computation.

2. **Tokio Runtime Setup**: For the asynchronous code to be executed, a runtime is required. This runtime manages the low-level details of task scheduling, IO, etc. The expanded code sets up this runtime explicitly:
```rust
tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .expect("Failed building the Runtime")
```
Here, a multi-threaded Tokio runtime is being built with all features enabled.

3. **Blocking on Async**: The following line:
```rust
.block_on(body);
```
Tells the runtime to execute the async block (`body`) and block the current thread until this asynchronous computation has finished.

4. **Clippy Allowance**: The line `#[allow(clippy::expect_used, clippy::diverging_sub_expression)]` is a hint to the Clippy linting tool to ignore certain potential warnings about the subsequent code. This is added to ensure the generated code doesn't trigger linting warnings.

## Summary:

In essence, the `#[tokio::main]` macro abstracts away the complexities of setting up the Tokio runtime and managing the transition between synchronous and asynchronous code. By using this macro, developers can focus on the core asynchronous logic without getting bogged down by boilerplate. The expanded version reveals all the "magic" that happens behind the scenes to make the async main function work seamlessly.


In essence, `cargo expand` offers an invaluable tool for anyone diving deep into Rust's powerful macro system, helping developers demystify and understand the inner workings of their code. You can try it your self on `#[derive()]` Traits. By adding `#[derive(Debug)]` to one of your custom structs or enums. Use `cargo expand` to see what code is generated, and then use the `println!("{:?}", instance_of_your_struct);` to print the debug representation. Similarly, explore with `#[derive(PartialEq)]` and test it by comparing two instances of your struct with `==` and `!=`. Happy coding!


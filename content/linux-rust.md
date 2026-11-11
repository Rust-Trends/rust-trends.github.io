+++
title = "Rust in the Linux kernel"
path = "linux-rust"
template = "linux-rust.html"
description = "How much Rust is in the Linux kernel? Lines of code, unsafe, FFI calls and drivers per release, v6.1 to today."
[extra]
seo_title = "Rust in the Linux Kernel: Lines of Code, Drivers and Unsafe per Release"
toc_not_generate = true
+++

Rust support landed in Linux 6.1 at the end of 2022. Since then every release has added a bit more:
abstractions in `rust/`, then real drivers for GPUs, network PHYs, Android Binder and more. This page
counts what is actually in the tree for every release since v6.1: how many lines of Rust there are,
where they live, how much of it is `unsafe`, and which C functions the Rust code calls. Rust is still
a very small part of the kernel. The numbers below show how small, and how fast it is growing.

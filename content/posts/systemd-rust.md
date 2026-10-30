+++
title = "systemd Now Accepts New Components Written in Rust"
date = 2026-10-29
description = "systemd merged support for programs written in Rust. New leaf tools only, no cargo, no_std, and the first one, systemd-keyring-setup, has landed."
[extra]
author = "Bob Peters"
toc_not_generate = true
+++

systemd sits at the core of nearly every Linux system. Each step a memory-safe language like Rust takes into that core makes Linux more future-proof, and with vulnerabilities being reported faster every year, those steps matter. After the kernel and <a href="https://rust-trends.com/newsletter/from-lab-to-factory-rust-in-production/" target="_blank">Ubuntu's Rust-based coreutils and sudo</a>, systemd is the next big piece of Linux to let Rust in.

On 24 October Christian Brauner merged <a href="https://github.com/systemd/systemd/pull/44324" target="_blank">support for writing systemd programs in Rust</a>, "after a long debate", as he put it <a href="https://mastodon.social/@brauner/117494833311192688" target="_blank">on Mastodon</a> (<a href="https://tweakers.net/nieuws/253730/ontwikkelaars-kunnen-nieuwe-systemd-componenten-voortaan-in-rust-bouwen.html" target="_blank">Tweakers</a> covered it in Dutch). Three days later the first one landed. <a href="https://github.com/systemd/systemd/pull/44114" target="_blank">systemd-keyring-setup</a> enrolls X.509 certificates into the kernel's `.dm-verity`, `.fs-verity` and `.bpf` keyrings at boot and then seals them. Brauner had written a C prototype of it, but that never got merged, so the tool started life in Rust.

At their Berlin hackfest the maintainers set tight limits. Rust is only for new tools at the edge of systemd. Existing C code stays, and nothing other components depend on gets written in Rust. There is no cargo, everything builds with meson, and the code is `no_std` with no outside crates. systemd even brings its own `Box` and `Vec`, in the style of the Linux kernel, where an allocation that fails returns an error instead of aborting the program. A Rust program links `libsystemd-shared` the same way the C programs do.

A stripped test program built with LTO is 32 KB, against 20 KB for the same program in C. For real tools, Lennart Poettering puts the difference at "like 20% larger" in the <a href="https://lwn.net/Articles/1102970" target="_blank">LWN comments</a>. To the person running it, a Rust tool looks like any other systemd tool, with the same `--help` and the same option parsing, and a test compares the two byte for byte. Secrets go into a `Vec<u8, Erasing>`, which wipes its memory when it is freed, so nobody has to remember to do that by hand.

For distributions, Rust support is optional and turns itself on when rustc 1.85, bindgen 0.71.1 and meson 1.4 are installed, the versions Debian 13 ships. Packagers who build with every optional feature enabled now have to add rustc and bindgen or switch Rust off. systemd's own Arch and openSUSE builds on OBS failed for that reason when the change was proposed. LWN thinks the work will probably ship in systemd v263, expected in December.

Is libsystemd next? Brauner <a href="https://mastodon.social/@brauner/117494833657858840" target="_blank">would like it to be</a>, "but there are several blockers in Rust's support for dynamic libraries which prevents us from doing that without massively bloating every binary we build." Whether outside crates will ever be allowed is open too; in the LWN comments he calls it a "we'll see where this goes" situation.

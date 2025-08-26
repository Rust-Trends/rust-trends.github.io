+++
title = "Cross-Compiling for Raspberry Pi with Docker"
date = "2025-04-25"
slug = "cross-compiling-for-raspberry-pi-with-docker"
description = "How I used Docker to easily cross-compile Rust projects for Raspberry Pi 4 with the right libraries and environment."
+++

So, I recently had to cross-compile a Rust project targeting a Raspberry Pi 4. Now, if you've ever wrestled with getting all the right libraries, sysroots, and toolchains lined up for ARM64, you know it can get messy faster than a `cargo check` on a broken dependency tree.

Instead of going down the rabbit hole of manually setting up sysroots or trying to copy over dev libraries from my Pi (been there, done that), I spun up a Docker container to emulate the environment. Not only did this isolate all the dependencies neatly, but it also let me keep my host setup clean and reproducible.

## The Dockerfile

We start from `debian:bookworm-slim` and install a bunch of goodies:
- The `gcc-aarch64-linux-gnu` toolchain for compiling to ARM64
- Rust via `rustup`
- Dev libraries like `libasound2-dev` and `libssl-dev` (which my project needed)

We also add the `aarch64-unknown-linux-gnu` Rust target and set up the linker to match.

```dockerfile
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y \
    curl gcc-aarch64-linux-gnu build-essential pkg-config \
    libasound2-dev libssl-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN rustup target add aarch64-unknown-linux-gnu
ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc
WORKDIR /workspace
```

To build the image, you need to have [Docker](https://www.docker.com/) installed and standing in the same directory as the Dockerfile.

```bash
docker build -t rust-pi-cross .
```

And to jump inside the container and open a shell, in this case bash:

```bash
docker run --rm -it -v /your/project/path:/workspace rust-pi-cross bash
```

- `/your/project/path` the location of your project on your host machine.
- `/workspace` the location of your project inside the container.
- `rust-pi-cross` the name of the Docker image.
- `bash` the command to run inside the container.

Inside the container, just cd into your project and run:

```bash
## Inside the container
cargo build --release --target aarch64-unknown-linux-gnu
```

## Why Docker?

You can cross-compile without Docker using cross or manually installing sysroots, but I liked this approach because:
	•	I needed dev versions of libasound2, and this gave me a full Debian userland to work with.
	•	It’s reproducible. Anyone on the team can build the same image and get the exact same result.
	•	No pollution on my host machine—bliss.

The resulting binary lives inside the container at:

```bash
## Inside the container
/workspace/target/aarch64-unknown-linux-gnu/release/<your-binary>
```

Or on your host machine via the mounted volume:

```bash
## On your host machine
/your/project/path/target/aarch64-unknown-linux-gnu/release/<your-binary>
```

That is it for this short tutorial. Let me know what your thoughts are on this approach and drop a message.

<center>

## Share
[Hacker News](https://news.ycombinator.com/submitlink?u=https://rust-trends.com/posts/cross-compiling-for-raspberry-pi-with-docker/)&nbsp;&nbsp;&nbsp;&nbsp;[Reddit](https://reddit.com/r/rust/submit?url=https://rust-trends.com/posts/cross-compiling-for-raspberry-pi-with-docker/)&nbsp;&nbsp;&nbsp;[LinkedIn](https://www.linkedin.com/shareArticle?mini=true&url=https://rust-trends.com/posts/cross-compiling-for-raspberry-pi-with-docker/)

</center>

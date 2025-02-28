+++
title = "Building a DNS Server in Rust: Part 1 of 2"
date = "2025-02-28"
slug = "Building a DNS Server in Rust"
description = "Learn how to build a DNS server in Rust from scratch. Explore the DNS protocol, create a simple server, and handle DNS queries with ease."
+++

# Introduction: Why Build a DNS Server?

Ever wondered how your browser finds websites? It all starts with DNS (Domain Name System). DNS servers are the backbone of the internet, translating human-readable domain names (like google.com) into IP addresses.

But have you ever wondered how these translations actually work under the hood? By building your own DNS server, you will gain a deeper understanding of networking, protocols, and systems programming, all while sharpening your Rust skills. In this tutorial, we will build a simple DNS server in Rust inspired by Codecrafters DNS challenge.

## Why Codecrafters?

Codecrafters provides hands-on system-building challenges, guiding you to create complex applications, like Redis, HTTP Server, and DNS servers—entirely from scratch. If you love learning by doing, this is the perfect platform for you.

Sign up using <a href="https://app.codecrafters.io/join-track/rust?via=Rust-Trends" target="_blank">my referral link</a> to support my content and unlock a 40% discount on your subscription. The best part? You can try it for free, no strings attached! If you go for a paid subscription, you might even qualify for reimbursement from your employer, so don’t miss out on this opportunity to level up your skills!

## What You’ll Learn
 - Part 1:
    - Understanding DNS requests and responses.
    - Handling UDP packets in Rust.
    - Parsing and constructing DNS packets.

 - Part 2:
    - Implementing decompression of DNS packets.
    - Forwarding DNS queries to resolvers.

# Accompanying GitHub Repository
The complete source code for this tutorial is available on <a href="https://github.com/Rust-Trends/dns-server-tutorial" target="_blank">Github</a>.

# Prerequisites

Before diving in, ensure you have the following:

- Rust installed: If you haven’t, install it using <a href="https://rustup.rs/" target="_blank">rustup</a>:

```curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh```

- Basic knowledge of Rust: Familiarity with variables, functions, structs, and enums.
- Basic networking concepts: Understanding of DNS resolution, and the differences between UDP and TCP.

To test your DNS server, use tools like `dig` or `nslookup`. To install `dig`, run:

```bash
# Ubuntu
sudo apt-get install dnsutils

# macOS
brew install bind
```

Later on we will explain how to use the dig tool to test our DNS server.

# Understanding DNS: A Quick Crash Course

A DNS request involves:

 1. A client (like your browser) sending a DNS query to a server.
 2. The server responds with an IP address (or forwards the query).
 3. The client uses that IP to establish a connection.

DNS messages are encoded as binary data to ensure efficient transmission over the network. This means we will be working with raw bytes rather than plain text. A request typically includes:

 - Header: Contains metadata.
 - Question: The domain name being queried.
 - Answer (in response): The resolved IP address.

The full specification is available in <a href="https://www.rfc-editor.org/rfc/rfc1035" target="_blank">RFC 1035</a> I’ll refer to it throughout this article and highlight the most relevant chapters. If you want a step-by-step walkthrough of the DNS protocol, I recommend <a href="https://github.com/EmilHernvall/dnsguide/blob/b52da3b32b27c81e5c6729ac14fe01fef8b1b593/chapter1.md" target="_blank">this article</a>.

# Setting Up the Project

Let’s create a Rust project for our DNS server:

```bash
cargo new dns-server
cd dns-server
```

Open your preferred text editor and navigate to the project directory. If you’re looking for a recommendation, <a href="https://zed.dev" target="_blank">Zed</a> is a great option.

Now, open Cargo.toml and add dependencies:

```bash
[dependencies]
clap = { version = "4.5.28", features = ["derive"] }
thiserror = "1.0.38"
```

Another way of doing the same is using `cargo add` in the project directory:

```bash
cargo add clap --features derive
cargo add thiserror
```

<a href="https://docs.rs/clap/latest/clap/" target="_blank">Clap</a> is a powerful and intuitive command-line argument parser for Rust, supporting subcommands, flags, options, and arguments.

<a href="https://docs.rs/thiserror/latest/thiserror/" target="_blank">Thiserror</a> is a lightweight crate for defining custom error types with Rust’s Error trait.

Now let's start writing our DNS server...

# Defining DNS Header structure
To handle a DNS request, we first need to define the structure of a DNS message. Let’s start by defining the DNS Header in a separate file called `dns.rs`. The DNS header structure is defined in <a href="https://www.rfc-editor.org/rfc/rfc1035#section-4.1.1" target="_blank">RFC 1035 - 4.1.1</a>.

```rust
// src/dns.rs
#[derive(Debug)]
pub struct Header {
    pub id: u16,      // identifier
    pub qr: bool,     // 0 for query, 1 for response
    pub opcode: u8,   // 0 for standard query
    pub aa: bool,     // authoritative answer
    pub tc: bool,     // truncated message
    pub rd: bool,     // recursion desired
    pub ra: bool,     // recursion available
    pub z: u8,        // reserved for future use
    pub rcode: u8,    // 0 for no error
    pub qdcount: u16, // number of entries in the question section
    pub ancount: u16, // number of resource records in the answer section
    pub nscount: u16, // number of name server resource records in the authority records section
    pub arcount: u16, // number of resource records in the additional records section
}
```

You do not need to know the meaning of each field in the DNS header. The fields are used by the DNS protocol to indicate the type of message, the status of the message, and the number of resource records in each section of the message among other things.

Since DNS messages are transmitted as raw binary data, we need to convert our Header struct into a byte array (serialization). When receiving a DNS request, we perform deserialization to reconstruct the Header from raw bytes.

Note that network byte order is big-endian (be) hence our use of the function `u16::to_be_bytes()` and `u16::from_be_bytes()`.

```rust
// src/dns.rs
impl Header {
    const DNS_HEADER_LEN: usize = 12;

    // Serialize the header into a byte array
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(Header::DNS_HEADER_LEN);

        buf.extend_from_slice(&self.id.to_be_bytes());
        buf.push(
            (self.qr as u8) << 7
                | self.opcode << 3
                | (self.aa as u8) << 2
                | (self.tc as u8) << 1
                | self.rd as u8,
        );
        buf.push((self.ra as u8) << 7 | self.z << 4 | self.rcode);
        buf.extend_from_slice(&self.qdcount.to_be_bytes());
        buf.extend_from_slice(&self.ancount.to_be_bytes());
        buf.extend_from_slice(&self.nscount.to_be_bytes());
        buf.extend_from_slice(&self.arcount.to_be_bytes());

        buf
    }

    // Deserialize the header from a byte array
    pub fn from_bytes(buf: &[u8]) -> Result<Header, ErrorCondition> {
        if buf.len() < Header::DNS_HEADER_LEN {
            return Err(ErrorCondition::DeserializationErr(
                "Buffer length is less than header length".to_string(),
            ));
        }

        Ok(Header {
            id: u16::from_be_bytes([buf[0], buf[1]]),
            qr: (buf[2] & 0b1000_0000) != 0,
            opcode: (buf[2] & 0b0111_1000) >> 3,
            aa: (buf[2] & 0b0000_0100) != 0,
            tc: (buf[2] & 0b0000_0010) != 0,
            rd: (buf[2] & 0b0000_0001) != 0,
            ra: (buf[3] & 0b1000_0000) != 0,
            z: (buf[3] & 0b0111_0000) >> 4,
            rcode: buf[3] & 0b0000_1111,
            qdcount: u16::from_be_bytes([buf[4], buf[5]]),
            ancount: u16::from_be_bytes([buf[6], buf[7]]),
            nscount: u16::from_be_bytes([buf[8], buf[9]]),
            arcount: u16::from_be_bytes([buf[10], buf[11]]),
        })
    }
}
```

Since we added an Error type to the deserialization function we need to include `thiserror` and define them. I will define the ErrorCondition enum at the top of the file.

```rust
// src/dns.rs
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ErrorCondition {
    #[error("Serialization Error: {0}")]
    SerializationErr(String),

    #[error("Deserialization Error: {0}")]
    DeserializationErr(String),
}

#[derive(Debug)]
pub struct Header {
 ...
 ...
}
```

Now we are going to implement the main loop where we will receive DNS queries from clients and send back responses. To start, we’ll implement a simple DNS server that decodes the DNS header and prints the query.

```rust
// src/main.rs
use std::net::UdpSocket;

mod dns;
use dns::Header;

fn main() {
    let socket = UdpSocket::bind("0.0.0.0:1053").expect("Could not bind to port 1053");
    let mut buf = [0; 512];

    println!("DNS server is running at port 1053");

    loop {
        let (len, addr) = socket.recv_from(&mut buf).expect("Could not receive data");
        let header = Header::from_bytes(&buf[..len]).expect("Could not parse DNS header");
        println!("Received query from {} {:?}", addr, header);
    }
}
```

Our current code contains several `expect` calls, which we’ll refine later. This exemplifies one of Rust’s key strengths: explicit error handling, ensuring that nothing is left to implicit behavior.

Now, let’s run the server! Open a terminal and start the DNS server: `cargo run`. Open another terminal and run `dig @localhost -p 1053 rust-trends.com`

Since we have not implemented DNS query processing, `dig` won’t receive a valid response. Instead, it may retry a few times before giving up. Because **UDP** is an unreliable protocol, dig simply attempts the query again if no response is received.

Example output from our server:
```bash
$ cargo run

DNS server is running at port 1053
Received query from 127.0.0.1:63928 Header { id: 22295, qr: false, opcode: 0, aa: false, tc: false, rd: true, ra: false, z: 2, rcode: 0, qdcount: 1, ancount: 0, nscount: 0, arcount: 1 }
```
Code for this part can be found in the <a href="https://github.com/Rust-Trends/dns-server-tutorial" target="_blank">Github</a> Repository under `step 1`.

Wow! We’re running a DNS server in Rust! Are you curious how the rest of the request looks like? Let's print it out!

# Printing the DNS Request

Before parsing the full DNS request, let’s first inspect the raw data. The function below prints the incoming bytes in a structured hex format, similar to how hex editors display binary files. This helps us visualize the request and debug potential issues.

If you’ve done low-level programming before, you’re probably familiar with hex editors. It has a convenient layout of printing bytes. An example of such a great editor can be found at <a href="https://hexed.it/" target="_blank">hexed.it</a>

Let’s take inspiration from this and extend main.rs to print the DNS request.

```rust
// src/main.rs
use std::net::UdpSocket;

mod dns;
use dns::Header;

// Debug print hex bytes of a buffer 16 bytes width followed by the ASCII representation of the bytes
fn debug_print_bytes(buf: &[u8]) {
    for (i, chunk) in buf.chunks(16).enumerate() {
        print!("{:08x}: ", i * 16);
        for byte in chunk {
            print!("{:02x} ", byte);
        }
        for _ in 0..(16 - chunk.len()) {
            print!("   ");
        }
        print!("  ");
        for byte in chunk {
            if *byte >= 32 && *byte <= 126 {
                print!("{}", *byte as char);
            } else {
                print!(".");
            }
        }
        println!();
    }
}

fn main() {
    let socket = UdpSocket::bind("0.0.0.0:1053").expect("Could not bind to port 1053");
    let mut buf = [0; 512];

    println!("DNS server is running at port 1053");

    loop {
        let (len, addr) = socket.recv_from(&mut buf).expect("Could not receive data");

        println!("\nReceived query from {} with length {} bytes", addr, len);
        debug_print_bytes(&buf[..len]);

        let header = Header::from_bytes(&buf[..len]).expect("Could not parse DNS header");
        println!("\n{:?}", header);
    }
}
```

Now, let’s run the server and send a DNS request using dig `dig @localhost -p 1053 rust-trends.com`.

```bash
DNS server is running at port 1053

Received query from 127.0.0.1:62942 with length 44 bytes
00000000: 3e 3f 01 20 00 01 00 00 00 00 00 01 0b 72 75 73   >?. .........rus
00000010: 74 2d 74 72 65 6e 64 73 03 63 6f 6d 00 00 01 00   t-trends.com....
00000020: 01 00 00 29 10 00 00 00 00 00 00 00               ...)........

Header { id: 15935, qr: false, opcode: 0, aa: false, tc: false, rd: true, ra: false, z: 2, rcode: 0, qdcount: 1, ancount: 0, nscount: 0, arcount: 1 }
```
Each line in the output represents 16 bytes of the request. The first column is the byte offset (e.g., 00000000). The next columns show the hexadecimal values of the bytes. Finally, the rightmost column prints the ASCII representation of printable characters, replacing non-printable bytes with dots (.).

This debug information is useful for understanding the DNS request. Did you notice the quirk where z is set to 2? It's a reserved field that can be used for future extensions and was expected to be zero. Huh!? What's that about? You can read more about it at <a href="https://unix.stackexchange.com/questions/591203/understanding-the-digs-dns-query-does-dig-set-non-zero-value-for-z-field" target="_blank">StackExchange</a>. Apperently RFC's get amended. For now, we’ll ignore it and move on....

Since the DNS header is always 12 bytes, and our total request length is 44 bytes, we can infer that the remaining 32 bytes correspond to the Question Section. Next, we’ll decode it to extract the domain name being queried.

Code for this part can be found in the <a href="https://github.com/Rust-Trends/dns-server-tutorial" target="_blank">Github</a> Repository under `step 1`.

# Defining the DNS Question Structure

In the Domain Name System (DNS), a question is a structured query that specifies the domain name and the type of record being requested. This structure is fundamental to DNS resolution and is formally defined in <a href="https://www.rfc-editor.org/rfc/rfc1035#section-4.1.2" target="_blank">RFC 1035, Section 4.1.2</a>.

A DNS question consists of three fields:
 - QNAME: The domain name being queried, represented as a sequence of labels. Each label is encoded as a length-prefixed string, and the entire name is terminated with a zero byte.
 - QTYPE: Specifies the type of DNS record being requested (e.g., A for IPv4 addresses, AAAA for IPv6 addresses, MX for mail exchange records).
 - QCLASS: Indicates the class of the query, with the most common value being IN (Internet).

## QNAME Encoding Details

DNS uses a compact encoding for domain names:
	1.	Each label (e.g., “www”, “rust-trends”, “com”) is prefixed by a single byte indicating its length.
	2.	Labels are concatenated sequentially.
	3.	The entire sequence is terminated with a zero byte (0x00).

## Example DNS Question for www.rust-trends.com

A DNS query for `www.rust-trends.com` requesting an A record (IPv4 address) in the Internet class would be structured as follows:

### QNAME Encoding

The domain name "www.rust-trends.com" is split into labels:
	•	"www" → 3 characters
	•	"rust-trends" → 11 characters
	•	"com" → 3 characters

DNS encoding rules:
	•	Each label is prefixed by its length as a single byte.
	•	The entire domain is terminated with a 0x00 byte.

### Encoded QNAME:
```
[03] 'w' 'w 'w' [0B] 'r' 'u' 's' 't' '-' 't' 'r' 'e' 'n' 'd' 's' [03] 'c' 'o' 'm' [00]

# in bytes
03 77 77 77 0B 72 75 73 74 2D 74 72 65 6E 64 73 03 63 6F 6D 00
```
Breaking it down:
	-	03 → Length of "www", followed by ASCII 77 77 77 (www).
	-	0B → Length of "rust-trends", followed by ASCII 72 75 73 74 2D 74 72 65 6E 64 73 (rust-trends).
	-	03 → Length of "com", followed by ASCII 63 6F 6D (com).
	-	00 → End of QNAME.

### Complete DNS Question Structure

A complete DNS question includes:
	-	QNAME → Encoded domain name.
	-	QTYPE → 00 01 (A record).
	-	QCLASS → 00 01 (Internet class).

__Final binary representation:__

```
[03] 'w' 'w 'w' [0B] 'r' 'u' 's' 't' '-' 't' 'r' 'e' 'n' 'd' 's' [03] 'c' 'o' 'm' [00] [00] [01] [00] [01]
03 77 77 77 0B 72 75 73 74 2D 74 72 65 6E 64 73 03 63 6F 6D 00  00 01  00 01
```

This is how a DNS client would structure a query to resolve www.rust-trends.com into an IPv4 address.

How should we structure this? Instead of storing the domain name as a single string, we break it down into its individual labels (e.g., www, rust-trends, com). This allows for more efficient processing when serializing and handling compressed DNS messages later. We can represent QTYPE and QCLASS as enums:

```rust
// src/dns.rs
...

pub struct Question {
    pub name: Vec<Label>,
    pub qtype: Type,
    pub qclass: Class,
}

#[derive(Debug, Clone)]
pub struct Label(String);
```

For the Types we can look at <a href="https://www.rfc-editor.org/rfc/rfc1035#section-3.2.3" target="_blank">section 3.2.3</a> and <a href="https://www.rfc-editor.org/rfc/rfc1035#section-3.2.2" target="_blank">section 3.2.2</a> of the RFC. Note that Types used in Resource Records are a subset of Types used in Questions, so for sake of simplicity we will use the same enum for both.

```rust
// src/dns.rs
...

#[derive(Debug, Clone)]
pub enum Type {
    // Below are Resource Record Types and QTYPES
    A = 1, // a host address
    NS = 2, // an authoritative name server
    MD = 3, // a mail destination (Obsolete - use MX)
    MF = 4, // a mail forwarder (Obsolete - use MX)
    CNAME = 5, // the canonical name for an alias
    SOA = 6, // marks the start of a zone of authority
    MB = 7, // a mailbox domain name (EXPERIMENTAL)
    MG = 8, // a mail group member (EXPERIMENTAL)
    MR = 9, // a mail rename domain name (EXPERIMENTAL)
    NULL = 10, // a null RR (EXPERIMENTAL)
    WKS = 11, // a well known service description
    PTR = 12, // a domain name pointer
    HINFO = 13, // host information
    MINFO = 14, // mailbox or mail list information
    MX = 15, // mail exchange
    TXT = 16, // text strings

    // Below are only QTYPES
    AXFR = 252, // A request for a transfer of an entire zone
    MAILB = 253, // A request for mailbox-related records (MB, MG or MR)
    MAILA = 254, // A request for mail agent RRs (Obsolete - see MX)
    _ALL_ = 255, // A request for all records
}
```

Finally, we define the QCLASS enum, as described in <a href="https://www.rfc-editor.org/rfc/rfc1035#section-3.2.4" target="_blank">section 3.2.4</a>, we will only be using the Internet class, but for the sake of completeness, we will add the other values in the enum:

```rust
// src/dns.rs
...

pub enum Class {
    IN = 1, // the Internet
    CS = 2, // the CSNET class (Obsolete - used only for examples in some obsolete RFCs)
    CH = 3, // the CHAOS class
    HS = 4, // Hesiod [Dyer 87]
}
```

Let's add the functionality to and deserialize the Question part of DNS query:

```rust
// src/dns.rs
impl Question {
    // The from_bytes() function reconstructs a Question struct by iterating through the buffer, extracting labels,
    // parsing the query type and class.
    pub fn from_bytes(buf: &[u8]) -> Result<Self, ErrorCondition> {
        let mut index = 0;
        let mut labels: Vec<Label> = Vec::new();

        println!("Labels:");
        while buf[index] != 0 {
            let len = buf[index] as usize;
            index += 1;
            labels.push(Label::new(&buf[index..index + len])?);
            println!("{:?}", labels); // For debugging purposes
            index += len;
        }

        index += 1;

        let qtype = Type::from_bytes(&buf[index..index + 2])?;
        index += 2;
        let qclass = Class::from_bytes(&buf[index..index + 2])?;

        Ok(Question {
            name: labels,
            qtype,
            qclass,
        })
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::new();

        // Write the labels to the buffer and add . inbetween and end with 0
        for label in &self.name {
            buf.push(label.len() as u8);
            buf.extend_from_slice(label.0.as_bytes());
        }
        buf.push(0);

        // Write the question type and class to the buffer
        buf.extend_from_slice(&self.qtype.to_bytes());
        buf.extend_from_slice(&self.qclass.to_bytes());

        buf
    }
}
```

The code uses functions to serialize and deserialize Type (field qtype) and Class (field qclass) into bytes and back into their respective types, requiring proper implementation see below.

```rust
// src/dns.rs

impl Type {
    pub fn from_bytes(bytes: &[u8]) -> Result<Type, ErrorCondition> {
        match u16::from_be_bytes([bytes[0], bytes[1]]) {
            1 => Ok(Type::A),
            2 => Ok(Type::NS),
            3 => Ok(Type::MD),
            4 => Ok(Type::MF),
            5 => Ok(Type::CNAME),
            6 => Ok(Type::SOA),
            7 => Ok(Type::MB),
            8 => Ok(Type::MG),
            9 => Ok(Type::MR),
            10 => Ok(Type::NULL),
            11 => Ok(Type::WKS),
            12 => Ok(Type::PTR),
            13 => Ok(Type::HINFO),
            14 => Ok(Type::MINFO),
            15 => Ok(Type::MX),
            16 => Ok(Type::TXT),
            252 => Ok(Type::AXFR),
            253 => Ok(Type::MAILB),
            254 => Ok(Type::MAILA),
            255 => Ok(Type::_ALL_),
            n => Err(ErrorCondition::DeserializationErr(
                format!("Unknown Question Type {}", n).to_string(),
            )),
        }
    }

    pub fn to_bytes(&self) -> [u8; 2] {
        let num = match self {
            Type::A => 1,
            Type::NS => 2,
            Type::MD => 3,
            Type::MF => 4,
            Type::CNAME => 5,
            Type::SOA => 6,
            Type::MB => 7,
            Type::MG => 8,
            Type::MR => 9,
            Type::NULL => 10,
            Type::WKS => 11,
            Type::PTR => 12,
            Type::HINFO => 13,
            Type::MINFO => 14,
            Type::MX => 15,
            Type::TXT => 16,
            Type::AXFR => 252,
            Type::MAILB => 253,
            Type::MAILA => 254,
            Type::_ALL_ => 255,
        };

        u16::to_be_bytes(num)
    }
}

impl Class {
    pub fn from_bytes(buf: &[u8]) -> Result<Self, ErrorCondition> {
        let num = u16::from_be_bytes([buf[0], buf[1]]);
        match num {
            1 => Ok(Class::IN),
            2 => Ok(Class::CS),
            3 => Ok(Class::CH),
            4 => Ok(Class::HS),
            _ => Err(ErrorCondition::DeserializationErr(
                format!("Unknown Question Class {}", num).to_string(),
            )),
        }
    }

    pub fn to_bytes(&self) -> [u8; 2] {
        let num = match self {
            Class::IN => 1,
            Class::CS => 2,
            Class::CH => 3,
            Class::HS => 4,
            Class::_ALL_ => 255,
        };

        u16::to_be_bytes(num)
    }
}

```

To deserialize the question, we need to modify `main.rs`:

```rust
// src/main.rs
use std::net::UdpSocket;

mod dns;
use dns::{Header, Question};

// Debug print hex bytes of a buffer 16 bytes width followed by the ASCII representation of the bytes
fn debug_print_bytes(buf: &[u8]) {
    ...
}

fn main() {
    let socket = UdpSocket::bind("0.0.0.0:1053").expect("Could not bind to port 1053");
    let mut buf = [0; 512];

    println!("DNS server is running at port 1053");

    loop {
        let (len, addr) = socket.recv_from(&mut buf).expect("Could not receive data");

        println!("\nReceived query from {} with length {} bytes", addr, len);
        println!("\n### DNS Query: ###");
        debug_print_bytes(&buf[..len]);

        let header = Header::from_bytes(&buf[..12]).expect("Could not parse DNS header");
        println!("\n{:?}", header);

        println!("\n### Question: ###");
        debug_print_bytes(&buf[12..len]);
        println!();

        let question = Question::from_bytes(&buf[12..len]).expect("Could not parse DNS question");
        println!("\n{:?}", question);
    }
}
```

Now that we can deserialize both the Header and Question, let’s restart the server and send a DNS request to observe the deserialization in action.

```bash
dig @localhost -p 1053 www.rust-trends.com
```

```bash
cargo run

DNS server is running at port 1053

Received query from 127.0.0.1:64228 with length 48 bytes

### DNS Query: ###
00000000: ef 60 01 20 00 01 00 00 00 00 00 01 03 77 77 77   .`. .........www
00000010: 0b 72 75 73 74 2d 74 72 65 6e 64 73 03 63 6f 6d   .rust-trends.com
00000020: 00 00 01 00 01 00 00 29 10 00 00 00 00 00 00 00   .......)........

Header { id: 61280, qr: false, opcode: 0, aa: false, tc: false, rd: true, ra: false, z: 2, rcode: 0, qdcount: 1, ancount: 0, nscount: 0, arcount: 1 }

### Question: ###
00000000: 03 77 77 77 0b 72 75 73 74 2d 74 72 65 6e 64 73   .www.rust-trends
00000010: 03 63 6f 6d 00 00 01 00 01 00 00 29 10 00 00 00   .com.......)....
00000020: 00 00 00 00                                       ....

Labels:
[Label("www")]
[Label("www"), Label("rust-trends")]
[Label("www"), Label("rust-trends"), Label("com")]

Question { name: [Label("www"), Label("rust-trends"), Label("com")], qtype: A, qclass: IN }
```

Code for this part can be found in the <a href="https://github.com/Rust-Trends/dns-server-tutorial" target="_blank">Github</a> Repository under `step 2`.

We see the label sequence and Question struct. We still do not have an answer for this DNS request so next we are going to implement a reply.

# Defining DNS Answer structure
The answer section in a DNS query reply is also called a <a href="https://www.rfc-editor.org/rfc/rfc1035#section-4.1.3" target="_blank">Resource record</a>. It includes several fields, such as the domain name, time-to-live (TTL), the Type and Class we previously defined for the question part and the actual data, which can contain an IP address or other relevant information. Below you can find the structure in code:

```rust
// src/dns.rs
#[derive(Debug, Clone)]
pub struct ResourceRecord {
    pub name: String,
    pub rtype: Type,
    pub rclass: Class,
    pub ttl: u32,
    pub rdlength: u16,
    pub rdata: Vec<u8>,
}

impl ResourceRecord {
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(MAX_DNS_MESSAGE_SIZE);

        self.name.split('.').for_each(|label| {
            buf.push(label.len() as u8);
            buf.extend_from_slice(label.as_bytes());
        });

        buf.push(0);
        buf.extend_from_slice(&self.rtype.to_bytes());
        buf.extend_from_slice(&self.rclass.to_bytes());
        buf.extend_from_slice(&self.ttl.to_be_bytes());
        buf.extend_from_slice(&self.rdlength.to_be_bytes());
        buf.extend_from_slice(&self.rdata);

        buf
    }
}
```

With the above method, we can easily construct a ResourceRecord as part of the reply. Ready to answer the query?

# Constructing a (hardcoded) reply
A valid DNS response consists of three main parts:
  - Header: Includes metadata, response flags, and record counts.
	- Question: Echoes the original query back to the client.
	- Answer: Contains the resolved IP address for the requested domain.

For now, our server will always return the fixed IP address 172.67.221.148 when queried for `www.rust-trends.com`.

We will use Rust’s Default trait to define a default ResourceRecord. This provides a simple and reusable way to hardcode a response for now.

```rust
// src/dns.rs
impl Default for ResourceRecord {
    fn default() -> Self {
        ResourceRecord {
            name: String::from("www.rust-trends.com"),
            rtype: Type::A,
            rclass: Class::IN,
            ttl: 60,
            rdlength: 4,
            rdata: Vec::from([172,67,221,148]),
        }
    }
}
```

Next, we adapt `main.rs` to send a response. We need to add the ResourceRecord in the use statement.

```rust
// src/main.rs
use std::net::UdpSocket;

mod dns;
use dns::{Header, Question, ResourceRecord};
```

After printing the query, we construct the response.

```rust
// src/main.rs
fn main() {
    let socket = UdpSocket::bind("0.0.0.0:1053").expect("Could not bind to port 1053");
    let mut buf = [0; 512];

    println!("DNS server is running at port 1053");

    loop {
        let (len, addr) = socket.recv_from(&mut buf).expect("Could not receive data");

        println!("\nReceived query from {} with length {} bytes", addr, len);
        println!("\n### DNS Query: ###");
        debug_print_bytes(&buf[..len]);

        let header = Header::from_bytes(&buf[..12]).expect("Could not parse DNS header");
        println!("\n{:?}", header);

        println!("\n### Question: ###");
        debug_print_bytes(&buf[12..len]);
        println!();

        let question = Question::from_bytes(&buf[12..len]).expect("Could not parse DNS question");
        println!("\n{:?}", question);

        // We parsed the DNS query and question, now we can respond to it
        let answer = ResourceRecord::default();

        println!("{:?}", answer);

        let response_header = Header {
            id: header.id,
            qr: true,              // It is a query response
            opcode: header.opcode, // Standard query
            aa: false,             // Not authoritative
            tc: false,             // Not truncated
            rd: header.rd,         // Recursion desired
            ra: false,             // Recursion not available
            z: 0,                  // Reserved
            rcode: if header.opcode == 0 { 0 } else { 4 },
            qdcount: 1, // Question count we assume is 1
            ancount: 1, // Answer count is 1
            nscount: 0, // Name server count is 0
            arcount: 0, // Additional record count is 0
        };

        // Create a response message with the header and question
        let mut response: Vec<u8> = Vec::new();
        response.extend_from_slice(&response_header.to_bytes());
        response.extend_from_slice(&question.to_bytes());
        response.extend_from_slice(&answer.to_bytes());

        // Send the response back to the client
        socket
            .send_to(&response, addr)
            .expect("Could not send response");
    }
}
```
Code for this part can be found in the Github Repository under `step 2`.

Our response reuses some fields from the incoming query but updates specific values:
	- qr = true → Indicates this is a response.
	- rcode = 0 (or 4 for unsupported opcode) → Specifies success or failure.
	- ancount = 1 → Indicates that one answer is included.

The deserialized question is re-serialized and included in the response. This ensures that the client can match the response to its original query.

A complete DNS response consists of:
 - Header – Metadata and response flags
 - Question – Echoed back from the request
 - Answer – The resolved IP address or relevant data

Note: including the question section in the response is a standard part of the DNS protocol, allowing clients to verify the response corresponds to their request.

Last step is putting it in one byte array and sending it to the client.

Now let's test our DNS server! Fire up dig and start the server

```bash
dig @localhost -p 1053 www.rust-trends.com
```

```bash
cargo run

DNS server is running at port 1053

Received query from 127.0.0.1:54734 with length 48 bytes

### DNS Query: ###
00000000: 2e 1f 01 20 00 01 00 00 00 00 00 01 03 77 77 77   ... .........www
00000010: 0b 72 75 73 74 2d 74 72 65 6e 64 73 03 63 6f 6d   .rust-trends.com
00000020: 00 00 01 00 01 00 00 29 10 00 00 00 00 00 00 00   .......)........

Header { id: 11807, qr: false, opcode: 0, aa: false, tc: false, rd: true, ra: false, z: 2, rcode: 0, qdcount: 1, ancount: 0, nscount: 0, arcount: 1 }

### Question: ###
00000000: 03 77 77 77 0b 72 75 73 74 2d 74 72 65 6e 64 73   .www.rust-trends
00000010: 03 63 6f 6d 00 00 01 00 01 00 00 29 10 00 00 00   .com.......)....
00000020: 00 00 00 00                                       ....

Labels:
[Label("www")]
[Label("www"), Label("rust-trends")]
[Label("www"), Label("rust-trends"), Label("com")]

Question { name: [Label("www"), Label("rust-trends"), Label("com")], qtype: A, qclass: IN }
ResourceRecord { name: "www.rust-trends.com", rtype: A, rclass: IN, ttl: 60, rdlength: 4, rdata: [172, 67, 221, 148] }
```

And looking at the dig output:

```bash
dig @localhost -p 1053 www.rust-trends.com

; <<>> DiG 9.10.6 <<>> @localhost -p 1053 www.rust-trends.com
; (2 servers found)
;; global options: +cmd
;; Got answer:
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 11807
;; flags: qr rd; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 0
;; WARNING: recursion requested but not available

;; QUESTION SECTION:
;www.rust-trends.com.		IN	A

;; ANSWER SECTION:
www.rust-trends.com.	60	IN	A	172.67.221.148

;; Query time: 0 msec
;; SERVER: 127.0.0.1#1053(127.0.0.1)
;; WHEN: Fri Feb 28 12:44:09 CET 2025
;; MSG SIZE  rcvd: 72
```

Wow it works! we can see it received the header, query and answer. Also note is show a warning about recursion requested but not available. By default, dig requests recursion, but our server does not perform recursive queries. The warning `WARNING: recursion requested but not available`simply indicates that recursion was requested but not supported. To remove this warning, use: `dig @localhost -p 1053 www.rust-trends.com +norecurse`.

You got your reply and can visit <a href="https://www.rust-trends.com" target="_blank">www.rust-trends.com</a>.

# Conclusion

We are coming to the end of Part 1 of this series. You've built a basic DNS server that can parse queries and return a hardcoded IP address. In the next part we will add support for DNS decompression and send the request to a resolver, collect the response, and construct a reply to the client.

This tutorial is inspired by the Codecrafters challenge of building your own DNS server. If you enjoy hands-on learning, use <a href="https://app.codecrafters.io/join-track/rust?via=Rust-Trends" target="_blank">my referral link</a> to get a 40% discount and support my content. You can even try it for free no strings attached!

Have questions or feedback? Drop a comment or reach out, I’d love to hear how your DNS server is coming along! Stay tuned for Part 2!

# Disclaimer  
This project is intended for **educational purposes** and may not be fully optimized for production use.  

You may notice warnings when running `cargo check` or `cargo run`, such as **unused code warnings**. For example, some `from_bytes` and `to_bytes` functions are not currently used, same holds for enum entries. These functions and entires have been intentionally left in place for **illustrative purposes** and to maintain **code symmetry**.

Contributions and improvements are always welcome! 🚀  

# Acknowledgments  
A huge thanks to the **Codecrafters team** for their support and guidance throughout this project.  

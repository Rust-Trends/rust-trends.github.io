+++
title = "Building a DNS Server in Rust: Part 2 of 2"
date = "2025-03-04"
slug = "Building a DNS Server in Rust Part 2"
description = "Continue building a DNS server in Rust by adding packet decompression and query forwarding to external resolvers."
+++

## Building a DNS Server in Rust: Part 2

Welcome back to our DNS server journey! In [Part 1](https://rust-trends.com/posts/building-a-dns-server-in-rust/), we laid the groundwork by building a simple DNS server that could parse queries and return a hardcoded IP address. If you haven't completed it yet, I highly recommend starting there to get a solid foundation.

In this second installment, we'll take our server to the next level. We'll introduce advanced features like DNS name decompression and query forwarding to external DNS resolvers. By the end of this tutorial, you'll have a dynamic DNS server capable of handling real-world requests with flexibility and power.

This project is inspired by the Codecrafters challenge, offering a practical and rewarding way to deepen your Rust skills while building something tangible and useful.

## Why Codecrafters?

Codecrafters provides hands-on system-building challenges, guiding you to create complex applications, like Redis, HTTP Server, and DNS servers—entirely from scratch. If you love learning by doing, like me, this is the perfect platform for you.

Sign up using <a href="https://app.codecrafters.io/join-track/rust?via=Rust-Trends" target="_blank">my referral link</a> to support my content and unlock a 40% discount on your subscription. The best part? You can try it for free, no strings attached! If you go for a paid subscription, you might even qualify for reimbursement from your employer, so don't miss out on this opportunity to level up your skills!

## What You'll Learn
- Implementing DNS Packet Decompression: Handle compressed domain names as specified in [RFC 1035](https://www.rfc-editor.org/rfc/rfc1035#section-4.1.4).
- Forwarding DNS Queries to Resolvers: Utilize external DNS services like `8.8.8.8` (Google DNS).
- Handling Dynamic Responses: Parse and forward the actual responses from the DNS resolver to the client.
- Dealing with Edge Cases and Errors: Implement robust error handling for invalid responses and network failures.

The complete source code for both parts of this tutorial is available on [GitHub](https://github.com/Rust-Trends/dns-server-tutorial).

## Recap of Part 1
In Part 1, we:
- Set up a UDP server in Rust.
- Parsed DNS headers and questions.
- Sent a hardcoded DNS response.
- Demonstrated testing with `dig` and `nslookup`.

If you missed it, check out the [first part of the tutorial](https://rust-trends.com/posts/building-a-dns-server-in-rust/). Next up is decompressing DNS names.

## Implementing DNS Name Decompression

### Why Name Decompression?
DNS uses name compression to reduce message size. This involves pointers within DNS messages that allow repeated domain names to be referenced without duplication. From the subchallenges this one is the most challenging. First let's understand how it works.

### How does decompression work?
In this section, you'll learn how DNS name compression works and how to decode compressed domain names by parsing a real DNS packet.

We already saw how label sequecenes are build up in Part 1, decompression uses pointers to reuse certain label sequences within the DNS message. Each label in a domain name is prefixed with a length byte. If the length byte starts with `0b11000000`, it indicates a pointer to another part of the message. The next two bytes represent the offset within the message. In the <a href="https://www.rfc-editor.org/rfc/rfc1035#section-4.1.4" target="_blank">Compression</a> can be found in chapter 4.1.4.

```
The pointer takes the form of a two octet sequence:

    +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
    | 1  1|                OFFSET                   |
    +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
```

The offset is relative to the start of the message. To demonstrate that we construct a test DNS request. First we have a Question with an uncompressed domain name `www.rust-trends.com`. Followed by a Question with a compressed domain name `dev.rust-trends.com` which uses a pointer at offset 0x10.

The packet breakdown:

```bash
Offset(hex) | Byte                                      | ASCII
------------+-------------------------------------------+---------------
0x00        | 43 E6                                     | ID = 0x43E6
0x02        | 01 00                                     | Flags: Standard query
0x04        | 00 02                                     | QDCOUNT: 2 questions
0x06        | 00 00                                     | ANCOUNT: 0 answers
0x08        | 00 00                                     | NSCOUNT: 0
0x0A        | 00 00                                     | ARCOUNT: 0
------------+-------------------------------------------+---------------
0x0C        | 03 77 77 77                               | "www"
0x10        | 0B 72 75 73 74 2D 74 72 65 6E 64 73       | "rust-trends"
0x1C        | 03 63 6F 6D                               | "com"
0x20        | 00                                        | End of domain
0x21        | 00 01                                     | Type: A (IPv4)
0x23        | 00 01                                     | Class: IN (Internet)
------------+-------------------------------------------+---------------
0x25        | 03 64 65 76                               | "dev"
0x29        | C0 10                                     | Pointer to offset 0x10 ("rust-trends.com")
0x2B        | 00 01                                     | Type: A (IPv4)
0x2D        | 00 01                                     | Class: IN (Internet)
------------+-------------------------------------------+---------------
```

Below is your packet visualized clearly in ASCII boxes:
```bash
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
00 |   43  |  E6  |  01  |  00  |  00  |  02  |  00  |  00  |
   +-------+------+------+------+------+------+------+------+
08 |   00  |  00  |  00  |  00  |  03  | 'w'  | 'w'  | 'w'  |
   +-------+------+------+------+------+------+------+------+
10 |  0B   | 'r'  | 'u'  | 's'  | 't'  | '-'  | 't'  | 'r'  |
   +-------+------+------+------+------+------+------+------+
18 |  'e'  | 'n'  | 'd'  | 's'  |  03  | 'c'  | 'o'  | 'm'  |
   +-------+------+------+------+------+------+------+------+
20 |  00   |  00  |  01  |  00  |  01  |  03  | 'd'  | 'e'  |
   +-------+------+------+------+------+------+------+------+
28 |  'v'  | C0   |  10  |  00  |  01  |  00  |  01  |
   +-------+------+------+------+------+------+------+
```

So in short the packet represents a DNS request containing two questions:
	•	www.rust-trends.com
	•	dev.rust-trends.com (compressed using pointer at offset 0x10)

The pointer `C0 10` after `dev` points to the domain name `rust-trends.com` to make the request for `dev.rust-trends.com`. To make this concrete, let's decode this DNS request containing a compressed domain in Rust.

### How to Implement Decompression
Thinking on how to structure and implement decompression logic, it is important to realize that decompression involves handling pointers, recursively resolving domain labels that span multiple requests so not a single consecutive label sequence. So decompressing a domain name(s) has to be done at the top level using the whole Vector of questions.

We will add a `decompress_name` function to our `dns.rs` file. This function will:
- Handle pointers using the `0b11000000` prefix.
- Recursively resolve domain labels.
- What we will not cover is prevention of infinite loops with proper error handling.

```rust
// src/dns.rs
impl Question {
    pub fn decompress_name(buf: &[u8], start: usize) -> Result<(String, usize), ErrorCondition> {
        let mut name = String::new();
        let mut index = start;
        let mut jumped = false;
        let mut jump_position = 0;

        loop {
            let len = buf[index] as usize;
            if len == 0 {
                index += 1;
                break;
            }

            if len & 0b11000000 == 0b11000000 {
                if !jumped {
                    jump_position = index + 2;
                }
                let offset = ((len & 0b00111111) as usize) << 8 | buf[index + 1] as usize;
                index = offset;
                jumped = true;
                continue;
            }

            index += 1;
            if !name.is_empty() {
                name.push('.');
            }
            name.push_str(&String::from_utf8_lossy(&buf[index..index + len]));
            index += len;
        }

        if !jumped {
            jump_position = index;
        }

        Ok((name, jump_position))
    }
}
```

### Testing Decompression

`dig` does not send compressed domain names, so we cannot test this interactively the same way we tested Part 1. Instead, we write a Rust unit test that constructs the exact packet we dissected above and asserts that both domain names are decoded correctly.

Add this to the bottom of `dns.rs`:

```rust
// src/dns.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decompress_name_with_pointer() {
        // Two-question packet: first has uncompressed www.rust-trends.com,
        // second has dev.rust-trends.com using a pointer to offset 0x10
        let packet: Vec<u8> = vec![
            // Header (12 bytes)
            0x43, 0xE6, 0x01, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            // Question 1 name: www.rust-trends.com (starts at offset 12)
            0x03, b'w', b'w', b'w',
            0x0B, b'r', b'u', b's', b't', b'-', b't', b'r', b'e', b'n', b'd', b's',
            0x03, b'c', b'o', b'm', 0x00,
            // Question 1 type + class
            0x00, 0x01, 0x00, 0x01,
            // Question 2 name: dev + pointer to offset 0x10 (starts at offset 37)
            0x03, b'd', b'e', b'v',
            0xC0, 0x10,
            // Question 2 type + class
            0x00, 0x01, 0x00, 0x01,
        ];

        let (name1, _) = Question::decompress_name(&packet, 12).unwrap();
        assert_eq!(name1, "www.rust-trends.com");

        let (name2, _) = Question::decompress_name(&packet, 37).unwrap();
        assert_eq!(name2, "dev.rust-trends.com");
    }
}
```

Run the test with:

```bash
cargo test
```

```bash
running 1 test
test dns::tests::test_decompress_name_with_pointer ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

`dev.rust-trends.com` was reconstructed even though its `rust-trends.com` suffix was never stored in full — only the `dev` label plus a pointer at offset `0x10`. That's name decompression working correctly.

Code for this part can be found in the <a href="https://github.com/Rust-Trends/dns-server-tutorial" target="_blank">Github</a> Repository under `step 4`.

## Forwarding DNS Queries to External Resolvers

### How Recursive Queries Work

In Part 1, our server always returned the same hardcoded IP — `172.67.221.148` — no matter what domain was requested. That's useful for learning, but not for a real server. We want to return the *actual* IP for whatever domain the client asks about.

The solution is query forwarding. Instead of answering directly, our server acts as a proxy: it takes the incoming query, forwards it verbatim to a real DNS resolver (we'll use Google's `8.8.8.8`), waits for the response, and relays it back to the original client. The flow looks like this:

```
Client (dig)  →  Our server (port 1053)  →  Google DNS (8.8.8.8:53)
                                         ←  Google DNS response
Client        ←  Our server relays response
```

This pattern is called a forwarding resolver. It doesn't cache or resolve authoritatively — it delegates to an upstream resolver and passes the answer through. It's a great first step toward a full recursive resolver, and it means our server can now answer queries for *any* domain without us maintaining any data ourselves.

### Setting Up Query Forwarding

We'll add a `forward_query` function to `main.rs`. It binds a temporary UDP socket on a random port, sends the query bytes to `8.8.8.8:53`, and returns whatever response it receives. We also set a read timeout so the server doesn't hang indefinitely if the upstream resolver is unreachable.

```rust
// src/main.rs
use std::net::UdpSocket;
use std::time::Duration;

fn forward_query(query: &[u8]) -> Result<Vec<u8>, String> {
    let resolver = "8.8.8.8:53";
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;

    socket
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;

    socket.send_to(query, resolver).map_err(|e| e.to_string())?;

    let mut buf = [0; 512];
    let (len, _) = socket.recv_from(&mut buf).map_err(|e| e.to_string())?;

    Ok(buf[..len].to_vec())
}
```

A few things worth noting here:
- We bind to `0.0.0.0:0` which lets the OS assign a free ephemeral port. We don't care which port we use for the outbound connection.
- `set_read_timeout` prevents indefinite blocking if `8.8.8.8` doesn't respond. After 5 seconds, `recv_from` returns an error.
- We return the response bytes as a `Vec<u8>`. This keeps the function simple — the caller decides what to do with the response.

## Parsing and Constructing Dynamic Responses

### Dynamic ResourceRecord Construction

Now that we can get a real response from `8.8.8.8`, let's add the ability to parse it. We'll add a `from_bytes` method to `ResourceRecord`. This takes the full response buffer and an offset pointing to where the record starts, returning the parsed record and the new offset (for parsing multiple records in sequence).

Notice that we pass the full `buf` — not a slice — because `decompress_name` needs access to the whole message to resolve compression pointers.

```rust
// src/dns.rs
impl ResourceRecord {
    pub fn from_bytes(buf: &[u8], offset: usize) -> Result<(Self, usize), ErrorCondition> {
        let (name, mut index) = Question::decompress_name(buf, offset)?;

        let rtype = Type::from_bytes(&buf[index..index + 2])?;
        index += 2;
        let rclass = Class::from_bytes(&buf[index..index + 2])?;
        index += 2;
        let ttl = u32::from_be_bytes(buf[index..index + 4].try_into().unwrap());
        index += 4;
        let rdlength = u16::from_be_bytes(buf[index..index + 2].try_into().unwrap()) as usize;
        index += 2;
        let rdata = buf[index..index + rdlength].to_vec();
        index += rdlength;

        Ok((
            ResourceRecord {
                name,
                rtype,
                rclass,
                ttl,
                rdlength: rdlength as u16,
                rdata,
            },
            index,
        ))
    }
}
```

The key difference from `to_bytes` is that we use `decompress_name` for the name field rather than a simple label iteration. DNS responses frequently use compression in their answer sections, so this is necessary for correct parsing.

### Integrating Forwarding in main.rs

With `forward_query` and `ResourceRecord::from_bytes` in place, let's wire everything together in `main.rs`. The server receives a query, forwards it to `8.8.8.8`, parses the response to log what we received, and relays the bytes back to the client.

```rust
// src/main.rs
use std::net::UdpSocket;
use std::time::Duration;

mod dns;
use dns::{Header, ResourceRecord};

fn forward_query(query: &[u8]) -> Result<Vec<u8>, String> {
    let resolver = "8.8.8.8:53";
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    socket
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;
    socket.send_to(query, resolver).map_err(|e| e.to_string())?;
    let mut buf = [0; 512];
    let (len, _) = socket.recv_from(&mut buf).map_err(|e| e.to_string())?;
    Ok(buf[..len].to_vec())
}

fn main() {
    let socket = UdpSocket::bind("0.0.0.0:1053").expect("Could not bind to port 1053");
    let mut buf = [0; 512];

    println!("DNS server is running at port 1053");
    println!("Forwarding queries to 8.8.8.8");

    loop {
        let (len, addr) = match socket.recv_from(&mut buf) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("Failed to receive: {}", e);
                continue;
            }
        };

        let query = &buf[..len];

        // Log what we received
        if let Ok(header) = Header::from_bytes(query) {
            println!(
                "\nQuery from {} (ID: {:#06x}, questions: {})",
                addr, header.id, header.qdcount
            );
        }

        // Forward to 8.8.8.8 and relay the response
        match forward_query(query) {
            Ok(response) => {
                // Parse and log the response answers
                if let Ok(resp_header) = Header::from_bytes(&response) {
                    println!("Response: {} answer(s), rcode={}", resp_header.ancount, resp_header.rcode);

                    // Walk past the header (12 bytes) and question section to reach answers
                    // For simplicity we skip the question section by scanning for its end
                    let mut offset = 12;
                    for _ in 0..resp_header.qdcount {
                        // Skip the question name (find the null terminator or pointer)
                        while offset < response.len() {
                            let byte = response[offset];
                            if byte == 0 {
                                offset += 1; // null terminator
                                break;
                            } else if byte & 0b11000000 == 0b11000000 {
                                offset += 2; // compression pointer
                                break;
                            } else {
                                offset += 1 + byte as usize; // label
                            }
                        }
                        offset += 4; // skip QTYPE + QCLASS
                    }

                    // Parse and print each answer
                    for i in 0..resp_header.ancount {
                        match ResourceRecord::from_bytes(&response, offset) {
                            Ok((record, next_offset)) => {
                                println!("  Answer {}: {} -> {:?}", i + 1, record.name, record.rdata);
                                offset = next_offset;
                            }
                            Err(e) => {
                                eprintln!("  Failed to parse answer {}: {}", i + 1, e);
                                break;
                            }
                        }
                    }
                }

                if let Err(e) = socket.send_to(&response, addr) {
                    eprintln!("Failed to send response to {}: {}", addr, e);
                }
            }
            Err(e) => eprintln!("Forward failed: {}", e),
        }
    }
}
```

The main loop now:
1. Receives any DNS query from a client.
2. Logs the query header (ID, number of questions).
3. Forwards the raw bytes to `8.8.8.8:53`.
4. Parses the response header and answer records for logging.
5. Relays the raw response bytes back to the original client.

We forward and relay the *raw bytes* rather than re-serializing our parsed structs. This keeps the code simple and avoids any risk of accidentally mangling the response during round-trip serialization. The parsing is purely for observability — so we can see what came back.

Code for this part can be found in the <a href="https://github.com/Rust-Trends/dns-server-tutorial" target="_blank">Github</a> Repository under `step 5`.

## Handling Errors and Edge Cases

Our current implementation uses `expect` and `unwrap` in several places. For a production server you'd want proper error propagation throughout, but even in a tutorial it's worth looking at the most important failure modes.

### Timeouts

The `set_read_timeout` call we added to `forward_query` is essential. Without it, `recv_from` blocks forever if the upstream resolver doesn't respond. With it, the call returns `Err` after 5 seconds and we log the failure instead of hanging:

```rust
socket
    .set_read_timeout(Some(Duration::from_secs(5)))
    .map_err(|e| e.to_string())?;
```

### Checking the Response Code

A DNS response carries an `rcode` field in the header. A value of `0` means success (NOERROR). Other values indicate problems — `3` means the domain doesn't exist (NXDOMAIN), `2` means the server failed (SERVFAIL). You should check this before processing answers:

```rust
if resp_header.rcode != 0 {
    eprintln!("Resolver returned error rcode={}", resp_header.rcode);
    // Still relay the response — the client needs to see the error too
}
```

You can find the full list of RCODE values in <a href="https://www.rfc-editor.org/rfc/rfc1035#section-4.1.1" target="_blank">RFC 1035 section 4.1.1</a>.

### Handling Short or Malformed Responses

Our `from_bytes` implementations will panic if the buffer is too short. In production code you'd check lengths before indexing. For now, wrapping the parse attempts in `match` and using `continue` on failure (as we do in `main`) prevents the server from crashing on a bad packet:

```rust
match Header::from_bytes(query) {
    Ok(header) => { /* process */ }
    Err(e) => {
        eprintln!("Bad header: {}", e);
        continue;
    }
}
```

## Testing the Enhanced DNS Server

Start the server and try querying for any real domain. Unlike Part 1, you should get back the actual current IP addresses:

```bash
# Terminal 1
cargo run
```

```bash
# Terminal 2 — query a real domain
dig @localhost -p 1053 rust-trends.com

; <<>> DiG 9.10.6 <<>> @localhost -p 1053 rust-trends.com
; (2 servers found)
;; global options: +cmd
;; Got answer:
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 48291
;; flags: qr rd ra; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 0

;; QUESTION SECTION:
;rust-trends.com.       IN  A

;; ANSWER SECTION:
rust-trends.com.    300 IN  A   104.21.38.196
rust-trends.com.    300 IN  A   172.67.221.148

;; Query time: 18 msec
;; SERVER: 127.0.0.1#1053(127.0.0.1)
```

Notice two A records — `rust-trends.com` is behind Cloudflare which returns multiple IPs for load balancing. Our server in Part 1 only ever returned one hardcoded address. Now we get the real, up-to-date answer.

Compare against Google DNS directly to verify they match:

```bash
dig @8.8.8.8 rust-trends.com
```

You should see the same IP addresses with similar TTL values. Our server is successfully proxying to `8.8.8.8` and returning its response unmodified.

Try a few more domains to confirm forwarding works generically:

```bash
dig @localhost -p 1053 github.com
dig @localhost -p 1053 crates.io
dig @localhost -p 1053 docs.rs
```

And verify your server logs show the answer records being parsed correctly:

```bash
DNS server is running at port 1053
Forwarding queries to 8.8.8.8

Query from 127.0.0.1:60421 (ID: 0xbc83, questions: 1)
Response: 2 answer(s), rcode=0
  Answer 1: rust-trends.com -> [104, 21, 38, 196]
  Answer 2: rust-trends.com -> [172, 67, 221, 148]
```

## Putting It All Together

Over these two parts, we built a DNS server from raw bytes up to a working forwarding resolver. In Part 1 we learned the wire format: headers, questions, label encoding. In Part 2 we tackled name compression — one of the trickier parts of the DNS spec — and added forwarding so our server returns real answers instead of a hardcoded IP.

The architecture we ended up with is minimal but correct:
- A single UDP loop receives queries on port 1053.
- Queries are forwarded verbatim to `8.8.8.8:53`.
- Responses are relayed back to the client.
- Name decompression allows us to parse domain names from both incoming queries and outgoing responses.

From here there's a lot you could add: caching responses to avoid redundant upstream queries, TCP support for large responses (DNS falls back to TCP when the response exceeds 512 bytes), authoritative answers for your own domains, or a full recursive resolver that walks the DNS hierarchy from root servers. The Codecrafters challenge covers several of these extensions if you want to keep going.

The complete source code for both parts is available on <a href="https://github.com/Rust-Trends/dns-server-tutorial" target="_blank">GitHub</a>. Clone it, experiment, and contribute!

## Conclusion

You've now built a fully functional DNS server in Rust! It can:
- Parse and decompress DNS requests.
- Forward queries to external resolvers.
- Return real, dynamic DNS responses.

Stay tuned for future tutorials where we might add caching, TCP support, and more!

## Disclaimer
This project is intended for **educational purposes** and is not fully optimized for production use.

When running `cargo check` or `cargo run`, you may notice warnings about **unused code**, such as `from_bytes` and `to_bytes` functions or unused enum variants. These have been **intentionally left in place** for **illustrative purposes** and to maintain **code symmetry**.

Contributions and improvements are always welcome! 🚀

## Acknowledgments
A huge thanks to the **Codecrafters team** for their support and guidance throughout this project.

<center>

## Share
[Hacker News](https://news.ycombinator.com/submitlink?u=https://rust-trends.com/posts/building-dns-server-in-rust-part-2/)&nbsp;&nbsp;&nbsp;&nbsp;[Reddit](https://reddit.com/r/rust/submit?url=https://rust-trends.com/posts/building-dns-server-in-rust-part-2/)&nbsp;&nbsp;&nbsp;[LinkedIn](https://www.linkedin.com/shareArticle?mini=true&url=https://rust-trends.com/posts/building-dns-server-in-rust-part-2/)

</center>

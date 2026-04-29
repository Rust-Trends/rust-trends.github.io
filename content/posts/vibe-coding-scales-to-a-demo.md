+++
title = "Vibe Coding Scales to a Demo"
date = 2026-04-29
description = "LLMs shifted coding from a manual craft to directing output. That doesn't mean fundamentals matter less. It means they matter differently."
[extra]
author = "Bob Peters"
toc_not_generate = true
+++

We're at an uncomfortable moment in software development, and I don't think most people are naming it correctly.

The tools have genuinely changed. You can describe what you want in plain language and get working code in seconds. That's not hype, that's just what it is now. And a lot of people look at that and conclude that knowing how to code matters less.

That conclusion is wrong. It's also understandable, because the evidence looks convincing from the outside.

<!-- more -->

# Two Camps

There are two ways I see developers approaching this shift.

The first is what people are calling vibe coding. Prompt until something works, iterate by feel, treat the model as a black box. Accept the output if the tests pass. Move on. This works fine for demos and scripts you'll run twice. It falls apart when software has to live in production, get maintained, or handle anything outside the happy path.

The second approach is using AI as a tool while bringing your own judgment to the output. You know what good architecture looks like. You know when an abstraction is hiding the wrong thing. You know when a concurrent data structure is going to cause problems under load. The model produces a draft. You evaluate it.

Both approaches can produce working code. Only one produces software worth keeping.

**Takeaways:**

- AI doesn't change what good software means. It changes how fast you can produce a bad first draft.
- Vibe coding compounds debt. Structured engineering compounds skill.
- The bottleneck moves from writing to evaluating.

# The Plausibility Problem

LLMs are good at producing plausible code. This is both the strength and the biggest risk.

Plausible is not the same as correct. And if you don't have a mental model of how systems behave, it's genuinely hard to tell the difference between code that works, code that works now, and code that will fail badly later.

Real software lives in the edge cases. Concurrency bugs that only surface under load. Performance issues that look fine in testing and explode in production. Brittle abstractions that seem clean until you need to change them.

These problems are not solvable by better prompting. You need to understand why they happen before you can recognize that the generated code is creating the conditions for them.

**Takeaways:**

- Code that compiles and passes tests is not the same as code that's correct.
- Debugging AI output requires the exact same skills as debugging hand-written code.
- Surface-level validation breaks down precisely when it matters most.

# What Fundamentals Actually Are

When people say "learn to code," they usually mean syntax and language features. That's the least important part.

The real value is a set of thinking tools. Problem decomposition, breaking vague requirements into precise steps. Abstraction skills, knowing what to hide versus what to expose. Reasoning about state. Debugging discipline, forming hypotheses and testing them rather than changing random things and hoping.

These skills don't become less useful when AI is generating the code. They move up a level. Instead of writing every function, you're deciding what the system should look like, evaluating what the model produces, steering the output toward something maintainable.

The thinking hasn't gone away. It just has a different target.

**Takeaways:**

- The skills needed have not changed. The level they operate at has moved up.
- Good prompts require the same decomposition skills as good code.
- Trade-off awareness is still entirely on you. The model doesn't know your constraints or your production environment.

# Amplifier, Not Replacement

A developer with strong fundamentals can use AI to generate scaffolding quickly, spot flawed assumptions in generated code before they become problems, and refactor outputs into something maintainable. They can hold a mental model of the whole system and evaluate each piece against it.

A developer without those fundamentals will accept suboptimal structures, accumulate debt quickly, and struggle to debug anything that goes wrong. They end up dependent on the model for direction because they don't have a clear picture of where they're trying to go.

The gap between these two outcomes is significant. It also compounds. The person building judgment gets better at using AI. The person without it gets more dependent on it.

**Takeaways:**

- AI raises the ceiling for strong developers. It lowers the floor for those without fundamentals.
- Leverage requires something to apply leverage to.
- Skill compounds. AI just accelerates the compounding.

# Learning Still Pays Off

If you're early in your career, or want to sharpen the fundamentals you already have, structured learning still pays off. The difference now is it doesn't have to be dry.

Platforms like <a href="https://app.codecrafters.io/join?via=Rust-Trends" target="_blank">Codecrafters</a> take a challenge-based approach where you implement real systems from scratch,
your own Git, Redis, Docker. It forces you to understand what's actually happening rather than relying on abstractions to hide the complexity.
If you're learning Rust, it's one of the more honest ways to do it.

The mental model you build from that kind of work is exactly what makes AI tools more useful to you, because you know what you're looking for in the output.

# The Shift

The question used to be: can you write this function?

The question now is: can you design, evaluate, and evolve this system?

That requires taste, judgment, and foundational knowledge. None of those come from accepting whatever the model produces.

You can build software today without deeply understanding it. But software that lasts, scales, and holds up to change still requires someone who understands what they're building.

AI makes you faster. Understanding makes you better. The combination is where the real leverage is.

---
title: How we review agent work before it ships
highlight: before it ships
coverText: Review before it ships.
description: "Approvals, diffs and undo windows: the three layers that let a small team run dozens of agents without losing sleep."
category: engineering
author: "Jordan Lee"
authorBio: "[Role]. Writes about agent reliability and product design."
date: 2026-10-14
readingMinutes: 8
featured: true
---

When we started running agents on real work, the failure we feared wasn't a wrong answer. It was a wrong answer that left the building before anyone noticed. Everything below exists to make that impossible by default.

## Approvals by default

Any action with an audience outside the workspace — posting, emailing, merging, spending — pauses and asks. The agent does all the preparation, so the human decision is small: read, then approve, edit or reject.

```yaml
agent: release-triage
autonomy: ask_first
always_ask:
  - slack.post_message
  - github.merge
  - billing.spend
```

<aside class="note"><strong>Note</strong><span>Approvals are equal-weight on purpose. Reject is never a faded link, so saying no costs the same effort as saying yes.</span></aside>

## Diffs, not descriptions

An agent saying “I updated the retry policy” is a claim. Showing `max_retries: 2 → 1` is evidence. Every approval shows exactly what will change.

<figure>
<div class="figure-placeholder">[DIAGRAM: agent → prepares diff → approval → ships]</div>
<figcaption>Figure 1. The approval loop. Diagrams are inline SVG, not images, to stay inside the page budget.</figcaption>
</figure>

## A 30-second undo

Approving fast is good; approving wrong is human. Every decision can be undone for 30 seconds with <kbd>⌘Z</kbd> before anything is sent.

> The goal isn't fewer approvals. It's approvals that take five seconds.

## What we'd do differently

- Start with “always ask” for everything, then loosen per action.
- Show cost next to every run from day one.
- Make the inbox finite. A feed of approvals trains people to skim.

# Prompt Architecture Principles

These principles apply to ALL agent prompts in the system. Every prompt file must follow these rules.

## Core Principle: Grounded Minimal Generation

Generate the **minimum complete answer** grounded in **real discovered data**.
Never produce more than what was asked. Never invent what wasn't discovered.

## Rule 1: User Scope Is Supreme

- Obey the user's request scope before applying any methodology
- If the user asks for 4 things, produce 4 things — not 20
- Do NOT expand scope unless explicitly requested
- Do NOT introduce metric families, panel categories, or sections the user did not ask for

## Rule 2: Discovered Data Is the Hard Constraint

- When metrics have been discovered from the datasource, use ONLY those metrics
- Do NOT supplement with "standard metrics that may not be in this list"
- If a required metric does not exist in the discovered list, **omit that panel and state the gap**
- Labels and label values must come from discovery, not from assumptions

## Rule 3: Knowledge Priority Order

1. **First**: Discovered metrics, labels, and sample values from the actual datasource
2. **Second**: Existing dashboard/investigation context
3. **Last**: Research and best practices — only as fallback when discovery is unavailable

Research tells you **what to look for**. Discovery tells you **what actually exists**.
Never let research override discovery.

## Rule 4: Conservative When Uncertain

- When metrics are unknown, prefer a narrower result grounded in discovered data
  over a comprehensive guessed result
- Do NOT "just do it with standard metrics" — use discovered metrics first
- If discovery is unavailable, state the limitation rather than hallucinating

## Rule 5: Simplest Effective Visualization

- Choose the visualization that best communicates the signal, not the most "diverse"
- All time_series is fine if that's what best represents the data
- Do NOT diversify chart types for the sake of variety
- stat for current values, time_series for trends, table for multi-dimensional data

## Rule 6: Panel Count Follows Content, Not Targets

- No fixed panel count targets (not "12-28 panels")
- Panel count is determined by: what the user asked + what data exists
- A 4-panel dashboard that answers the question is better than a 20-panel dashboard that doesn't

## Rule 7: Critic Must Check Scope First

Before reviewing quality, the critic must verify:
1. Does every panel directly serve the user's request?
2. Were any unrequested metric families introduced?
3. Was the scope expanded beyond what was asked?

Scope violation is a blocking issue, not a style preference.

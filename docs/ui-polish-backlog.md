# UI Polish Backlog

## P1: Panel visibility
- Some panels still get clipped/cut off at the bottom
- Chart Y-axis labels cut off on the left edge
- Need to ensure content area has minimum padding

## P1: Dashboard generation retry loop
- When verifier rejects panels, orchestrator retries and says "I'm sorry the first attempt failed"
- But retry doesn't start fresh — it appends to existing panels
- Need: clear dashboard before retry, or don't retry at all (just report verification failure)

## P1: Panel hover toolbar animation
- Edit/delete buttons fly in from off-screen instead of appearing in-place
- Should be like Grafana: toolbar appears at top-right of panel on hover, no animation or subtle fade
- Current: uses CSS transform/transition that starts from a distant position

## P2: Panel hover tooltip content
- Hover shows wrong/stale content
- Should show panel title + current value + time range

## P2: Grafana-like panel UX reference
- Panel header: title left, actions (edit/delete/duplicate) right, visible only on hover
- No fly-in animation — simple opacity transition
- Drag handle at top of panel (not separate button)
- Resize handle at bottom-right corner

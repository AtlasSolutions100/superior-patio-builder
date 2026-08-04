---
name: QA drag-and-drop & stale HMR
description: Why drag/drop UI tests fail falsely and how to get reliable runs
---

**Rule:** When a testing subagent reports drag-and-drop drop zones "not appearing", first have it HARD-RELOAD the page, and make it dispatch DragEvents with a real `new DataTransfer()`.

**Why:** Vite HMR "Failed to reload <file>" errors (from mid-edit syntax states) leave the tester's long-lived browser tab running stale modules — new props/variants silently absent until a full reload. Also, synthetic `dragstart` without dataTransfer used to abort the handler; the card handler now guards `e.dataTransfer`, but events still need `bubbles: true` + DataTransfer to behave.

**How to apply:** In follow-up test plans after frontend edits, include "hard reload the page first". Treat a failing synthetic drop→dialog step as harness mechanics if the same code path passed with a real mouse drag in another role/run. Also: testers must use the one-click demo login buttons (admin@demo.com etc.) — manually signing up any other email JIT-provisions a viewer.

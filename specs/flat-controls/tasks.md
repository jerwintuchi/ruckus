# Flat Controls — Tasks

- [x] T1 [R1, P2] — Take the shadow off every control in `src/client/src/ui/kit.ts` and
  `src/client/src/ui/controls.ts`: `button`, `.iconbtn`, `#stickKnob`, and `kbd`
  Test: `flat.test.ts` — every selector that is a control declares no `box-shadow`,
  partitioned from the slab selectors which must still declare one; the stick knob
  specifically, since that is the one that shipped looking off-centre

- [x] T2 [R2, P1] — One press language: `PRESS_SCALE` plus an ink-soak fill, replacing
  `translateY` and the shadow swap
  Test: `flat.test.ts` — no `:active` rule anywhere mentions `box-shadow` or
  `translateY`; every control's `:active` sets both a scale and a background; under
  `prefers-reduced-motion` the scale goes and the fill stays (R2's last AC)

- [x] T3 [R1] — Write the rule where it will be met: one line in
  `.claude/rules/kit-rules.md`, and amend `visual-direction` R10 in place
  Test: `check.test.ts` — `kit-rules.md` states the shadow rule; `spec_status --check`
  stays green with the amended requirement committed alongside

- [ ] T4 [R3] — Seen, on the two profiles it is judged on
  Test: `tools/visuals.sh` — the manifest changes only for states containing a control,
  and the stick reads centred; then **on the phone**, because whether a press still
  feels like a press is not a thing a screenshot can answer

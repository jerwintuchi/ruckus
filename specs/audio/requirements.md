# Audio — Requirements

> **The game is completely silent.** Not by decision — by omission.

*Written 2026-08-31. **Specced, not built.** The shape is agreed here so it does not get
invented twice; the work waits until the open manual boxes close.*

## The constraint that shapes everything

`kit_check.py` rejects `.mp3`, `.wav` and `.ogg`, and it does so for RD-001's reason:
an asset pipeline is the thing that stalled the previous project, and a sound library is
an asset pipeline wearing a different hat. So audio here is **generated in code** —
oscillators, envelopes and filtered noise through WebAudio — exactly the argument that
produced the procedural textures (RD-020).

That is a real constraint, not a pose. It rules out recorded sound, sampled instruments
and anything licensed. What it buys is that no round can ever be blocked on finding a
noise, and the whole audio surface stays reviewable in one file.

**R1**: No audio files, ever.
- AC: `kit_check.py --check` stays green, and the banned list keeps `.mp3/.wav/.ogg`
- AC: every sound is synthesised at runtime from `AudioContext` primitives
- AC: a sound the synthesiser cannot express is a sound the game does without

**R2**: Sound is information first, decoration second.
- AC: the round countdown, an elimination, a round ending and the match ending are
      audible — these are the four moments a player currently has to be looking at the
      screen to notice
- AC: nothing loops, and nothing plays continuously; a party is loud and a drone is lost
- AC: every sound is under 400 ms

**R3**: It starts silent and stays polite.
- AC: **no sound before a gesture.** Browsers require it, and so does courtesy: a link
      opened in a room full of people must not shout.
- AC: a mute control that persists across rounds, and across a reload
- AC: `prefers-reduced-motion` is not a mute, but a separate explicit control is

**R4**: It costs nothing on the frame budget.
- AC: nodes are created per sound and released; no pool grows without bound
- AC: audio never runs on the render path, and never allocates in `frame()`
- AC: measured on a phone alongside the bench, not assumed (RD-028's lesson)

**R5**: The client stays untrusted and the server stays ignorant.
- AC: sounds are triggered by messages the client already receives — no new wire
      traffic, no "play this sound" message. The server does not know audio exists.

## Open questions for whoever builds it

- Does a countdown blip help or crowd the rule card, which already has three seconds of
  visible count?
- Is per-player elimination sound too busy at eight players, or is it the best part?

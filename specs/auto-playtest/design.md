# Automated Playtest — Design

Satisfies R1–R4.

## Two pieces, no dependencies

**`?auto=NAME`** in `main.ts`: sets the name, joins the room from `?room=`, and feeds
`InputController.setSynthetic` a wandering circle plus a periodic button press. It goes
through the same `net.connect`, the same reducer and the same `read()` every player
does — a harness that skipped them would be verifying itself.

**`tools/shoot.sh`**: runs Windows Chrome headless with `--screenshot` and
`--virtual-time-budget`, pointed at the dev server over the WSL interface. Chrome is
already on the machine, so nothing is installed. Images land in `${TMPDIR}/ruckus-shots`,
outside the repo.

**P1** (R2): `kit_check` stays green with no `ALLOW_PATHS` entry. The first version wrote
into `.playtest/` and the guard rejected it — correctly. The answer was to keep images
out of the tree, not to carve out an exception; a guard that grows exceptions for
convenience stops being one.

**P2** (R1): `setSynthetic` is the only test seam, and it feeds the ordinary `read()`
rather than replacing it.

## What it is not

Software rendering, one process, no touch hardware. It answers *does this look right*.
It cannot answer *does this feel right*, *does it hold 60 fps*, or *would a stranger
work out the controls* — and those are exactly the questions every remaining manual task
in every other spec is about.

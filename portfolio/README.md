# Portfolio

This folder is the retrospective, reader-facing record of GrantPipe: finite, evidence-backed, and
checkable. Every number below traces to a file in this repository or a command you can re-run
against it. If a claim here does not survive that check, that is a defect in the claim, not a
license to trust the next one less carefully.

`docs/` is the opposite of this folder on purpose. It is prospective and self-addressed: dated
planning notes, audit runs, marketing drafts, and the video-production pipeline, kept unpolished
because they were never written for a reader. If you want the finished argument, stay in
`portfolio/`. If you want to see the work as it happened, `docs/` is where that lives: start with
[`docs/goal-portfolio-public/LEDGER.md`](../docs/goal-portfolio-public/LEDGER.md), which is the
record of how this snapshot itself was prepared and verified.

## If you read one thing

[`ENGINEERING-LOG.md`](./ENGINEERING-LOG.md). It is the only document here anchored entirely to
file paths and line numbers instead of prose claims, and it is where the money-splitting
invariant, the tenancy middleware, and the regression test that greps the whole repository for a
retired federal figure are all explained in the code that enforces them.

## Files in this folder

| File                                       |    Length | Covers                                                                                                                |
| ------------------------------------------ | --------: | --------------------------------------------------------------------------------------------------------------------- |
| [ARCHITECTURE.md](./ARCHITECTURE.md)       | 170 lines | Three deployables, one shared type system, the request path between them, and the platform primitives actually in use |
| [ENGINEERING-LOG.md](./ENGINEERING-LOG.md) | 324 lines | The twelve parts that were hardest to get right, each pointing at the file that proves it                             |
| [METRICS.md](./METRICS.md)                 |  93 lines | Every scale, structure, and coverage number in the README, each with the command that produced it                     |
| [PROJECT-HISTORY.md](./PROJECT-HISTORY.md) |  see file | What the 4,266 development commits contain, read out of the private repository's `git log`                            |
| [SECURITY.md](./SECURITY.md)               | 335 lines | An unedited internal security review, with each finding's fix, file, and line                                         |
| [TESTING.md](./TESTING.md)                 | 174 lines | Test layers, the per-file coverage gate and where it doesn't reach, and one worked defect                             |

Every file above is a finished, evidence-backed write-up, checkable against this repository. The
production-readiness checklist as it stood mid-build, the YouTube video pipeline, marketing and
pricing drafts, and feature-opportunity research are working residue from building the thing, dated
and unpolished, and they stay in `docs/` rather than here.

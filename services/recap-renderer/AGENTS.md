# Big Exec Recap Renderer Instructions

Before modifying this service, read:

- `../../docs/PRODUCT_PRD.md`
- `../../docs/OPERATING_GUARDRAILS.md`
- `../../docs/recap/RECAP_V2_PRD.md`
- `../../docs/recap/RECAP_V2_DEVELOPER_TASKS.md`
- `../../docs/recap/RECAP_V2_SPRINT_PLAN.md`

## Locked rules

Big Exec Recap V2 is **action-first, not text-first**.

Text supports the video. Text is not the video.

Fantasy facts must remain deterministic. Never invent scores, winners, yards, touchdowns, standings, MVPs, achievements, or rivalry outcomes.

Standard V2 recaps require visual action.

A 20+ yard rushing TD triggers the Fire Trail treatment where supported. Major passing highlights support the Rocket Arm treatment.

Preserve the existing queue / worker / FFmpeg / R2 architecture unless benchmark evidence demonstrates that replacement is necessary.

Do not use exact athlete likenesses or unauthorized league/team visual IP.

Run both 9:16 and 16:9 before declaring a visual scene complete.

The production V1 renderer remains rollback-capable until V2 passes the creative and technical acceptance suite.

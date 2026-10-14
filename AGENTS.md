# AGENTS.md — versatile-computer-use (VCU)

## 最高准则：停手前自检、禁止谎称完成 {#supreme severity=hard priority=P0}

本准则高于其他工作规则，也高于历史交接里的停手说明。冲突时以本准则为准。它不授权擅自领取下一项，也不取消红线。

任务完成、阻塞，或准备 stop、挂起、结束回合之前，必须用 AWR 实查，不得凭记忆或旧快照停手：

- 自检可执行和待派发工作：`rtk proxy awr --project . status` 与 `rtk proxy awr --project . ready`。Continue、Claimable、Waiting 都要看。仍有可继续或可派发的工作，必须如实报告，不得假装无事可做。
- 阻塞必须验真。真阻塞是依赖未完成、外部状态变化、用户明确要求暂停，或红线禁止。假阻塞包括未查 ready、把 planned 当成不能做、把旧交接的“不要领取”当成永久禁止、锁屏空 AX、未跑测试就称失败。假阻塞不得写成 blocked。
- 禁止说谎。状态、证据、测试结果、完成和未测环境必须与命令输出和源文件一致。计划、文档标记、调用成功或历史哈希不是功能已交付。
- 禁止未充分测试就标记完成。完成必须有与当前验收标准对应的实际测试或真机证据。mock、本机和未测要分开。没有独立读回或正反向证据，不得把源状态改成 completed，也不得把调用成功当成业务成功。
- 每个任务和阶段完成后必须落地标注和文档：更新台账状态、验收证据，以及 PLAN、HANDOFF 或对应专项文档，然后 `rtk proxy awr --project . source reindex` 并复查 intake。未写入权威源的进度不算已记录。

领取和开工仍须用户明确要求。不得用“未要求领取”掩盖 ready 队列，也不得因为还有 ready 就擅自开工。红线不变：不改 TCC，不点 Edge Allow，不移动系统光标，不自动化微信，不改 `~/.codex/computer-use/`。

## Shell / RTK

This project requires [RTK](https://github.com/rtk-ai/rtk) for agent shell commands.

- Always prefix shell commands with `rtk` (see `~/.codex/RTK.md`).
- If `rtk` is missing: `curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh`
- Verify: `rtk --version` and `which rtk`.

## AWR project hosting

Work state is hosted by [AWR](https://github.com/originoneai/agent-work-runtime) (`awr` ≥ 0.4.0).

```sh
awr --project . status
awr --project . ready
awr --project . intake inspect --json
awr --project . context compile --work <ID> --goal 'goal#vcu' --budget 5000
```

Authoritative sources (in order):

- `docs/PLAN.md` — current priorities and released browser Bridge 0.2.8 baseline
- `docs/PLAN-MAINLINES.md` — all tracks, execution batches, dependencies and acceptance; macOS remains first
- `docs/PLAN-MACOS.md` — macOS-first execution plan, MAC-001…008 and MAC-NEXT acceptance
- `docs/PLAN-BROWSER.md` — BR-001…006 and BROWSER-NEXT; baseline before MAC-007, feasibility research later
- `docs/PLAN-RUNTIME-DELIVERY.md` — shared runtime, host, optional vision, isolated delivery and candidate QA
- `docs/WINDOWS-DEV.md` — Windows checkout, Edge-only test, and unpacked extension update. Do not publish the extension to a store.
- `docs/ROADMAP-CU.md` — desktop architecture and historical CU-D slices; current execution follows PLAN-MACOS
- `docs/testing/DESKTOP_CU_TEST_PLAN.md` — desktop CU tests
- `.awr/intake/GOALS.md`
- `.awr/intake/work-ledger.yaml`
- `docs/HANDOFF.md` — session continuity (do not treat stacked snapshots as the plan)
- `docs/AGENT.md` — how a host AI connects on Windows and macOS. Not the work plan.
- `docs/testing/BROWSER_TEST_PLAN.md` / `BROWSER_TEST_CASES.md`

## Working rules

- **Released 0.2.8 is browser Computer Use.** Follow `docs/PLAN-MAINLINES.md` with macOS first; start MAC-001, then dependencies. BR-001…004 gate MAC-007; BR-005 is later feasibility research, and Windows WIN-101…103 follow QA-001. Do not implement a slice until that ID is active; do not describe plans or unsupported research as delivered. Feishu send, optional vision and other named draft candidates remain unclaimed until scheduled.
- Login-state web path stays USER Edge/Chrome + `~/.vcu/lens-extension`. Host vision (Grok) is enough; do not require `vcu init model`.
- DOM extract/click/type/scroll must be `source=extension_dom` when using the extension. AX chrome is not HTML DOM.
- Never click Edge Allow debugging. Never automate WeChat. Never warp the OS cursor. Local `/reference/` (gitignored) may be reverse-engineered for architecture notes. Do not commit the .app, decompiled sources, or extracted official assets. Do not edit the live `~/.codex/computer-use/` install. Reimplement in VCU with original code under `assets/`.
- Browser extension stays unpacked in the user profile. Do not publish it to the Chrome Web Store or Edge Add-ons.
- 停手、挂起、阻塞或标记完成前，先执行「最高准则」里的 AWR 自检。
- Prefer editing authoritative Markdown/YAML; reindex with `awr source reindex`.
- Preserve unrelated edits; keep commits focused.

## Session continuity

On a new session, read **`docs/PLAN.md`**, **`docs/PLAN-MAINLINES.md`**, the relevant track plan, then **`docs/HANDOFF.md`**. Use **`docs/ROADMAP-CU.md`** for desktop architecture/history. Historical handoff stop/parking instructions do not override the 2026-09-28 all-track plan with macOS priority. Before stop, suspend, block, or completion, follow **最高准则** and recheck `awr status` / `awr ready`.

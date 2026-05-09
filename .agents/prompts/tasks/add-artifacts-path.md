In capture file frontmatter add artifacts_folder field, like that:

---
date: 2026-05-08
time: 14:29
agent: antigravity
task: fixing-antigravity-scribe-capture-counter
workspace: "/data/projects/antigravity-scribe"
brain_uuid: 7b65729a-8fd1-412b-93ff-16573817c6f2
tags:
  - agent-session
  - antigravity
artifacts_folder:
  - <brain_full_path>/<brain_uuid>
---

get <brain_full_path> from extension settings.
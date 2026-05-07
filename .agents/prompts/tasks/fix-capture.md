I want in User message when user reference to files/folders to be marked with @[filename].

Curently i have:
---
## 👤 USER

repomix.config.jsoni have setup to ignore ".agents/**", but in repomix-output.xmli see : <file path=".agents/prompts/improve_capture.md">
---
But i want:
---
## 👤 USER

@[repomix.config.json]i have setup to ignore ".agents/**", but in @[repomix-output.xml]i see : <file path=".agents/prompts/improve_capture.md">
---

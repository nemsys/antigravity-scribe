## Context: 
1. /data/projects/antigravity-scribe/repomix-output.xml
2. /data/projects/antigravity-scribe/scraper/scraper.py
3. /data/projects/antigravity-scribe/.debug/AgentSessions/20260512_1438_disabling-media-asset-capture.md

## TASK:
scraper.py is able to parse agent conversation from DOM of the antigravity agent pannel correct. I tried to implement the same logic into the app - VSCode extension (see 1. for Context) but it did not produce same results.
I tested with a conversation titled "disabling-media-asset-capture" and the output is garbage. I think that first all style elements must be removed.


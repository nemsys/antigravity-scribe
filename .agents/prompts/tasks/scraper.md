## Context
1. /data/projects/antigravity-scribe/.debug/DOM_exports/cleaned/ - sample files containing the DOM of the user-agent conversation
2. /data/projects/antigravity-scribe/.debug/Screenshots/fixing-agent-interaction-export.png - the expected output screenshot (not full as there is not enough space for the full conversation in the screenshot)

## Task
Analyze carefully files in DOM_exports.cleaned directory to understand the structure of the DOM.
Create a scraper script to extract the user-agent conversation from DOM to a markdown file. All conversation details must be captured.
Try to make it as close to the expected output screenshot as possible (the screenshot captures only the beginning part of the conversation)

## Output
Output the scraper script to a file named scraper.py in /data/projects/antigravity-scribe/tmp/ folder.

## Workflow
- analyze the DOM structure of the conversation
- create a scraper script to extract the conversation from DOM to a markdown file
- ensure all conversation details are captured
- if needed, ask for clarifications
- test your script and make sure it works as expected
# Runs ONE fresh agent session on the next AFK issue.
# Usage:  .\ralph-once.ps1
$commits = (git log -5 --oneline) -join "`n"
$prompt = @"
Read ralph-prompt.md and follow it exactly.
The open issues are the .md files in the issues/ folder (ignore issues/done/). Read them yourself.
Last 5 commits:
$commits
"@
claude --permission-mode acceptEdits $prompt

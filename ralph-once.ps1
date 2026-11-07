# Runs ONE agent session on the next AFK issue (human-in-the-loop: watch what it does).
# Usage:  .\ralph-once.ps1
$issues = Get-ChildItem -Path "issues" -Filter "*.md" -File |
          ForEach-Object { "`n===== $($_.Name) =====`n" + (Get-Content $_.FullName -Raw) }
$commits = git log -5 --oneline 2>$null
$prompt  = Get-Content "ralph-prompt.md" -Raw

$full = "# Open issues`n$($issues -join "`n")`n`n# Last 5 commits`n$commits`n`n# Instructions`n$prompt"
claude --permission-mode acceptEdits $full

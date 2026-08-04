# Publica o repo myrep no GitHub (requer: gh auth login)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

$gh = "C:\Program Files\GitHub CLI\gh.exe"
if (-not (Test-Path $gh)) { $gh = "gh" }

& $gh auth status
if ($LASTEXITCODE -ne 0) {
  Write-Host "Execute: gh auth login"
  exit 1
}

git branch -M main
& $gh repo create myrep --private --source=. --remote=origin --push
Write-Host "Repo: https://github.com/$(& $gh api user -q .login)/myrep"

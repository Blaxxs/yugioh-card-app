param(
  [string]$Message = "Update app"
)

$ErrorActionPreference = "Stop"

Write-Host "Running lint..." -ForegroundColor Cyan
npm run lint
if ($LASTEXITCODE -ne 0) { throw "Lint failed. Deployment stopped." }

Write-Host "Running build..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed. Deployment stopped." }

git add .
if ($LASTEXITCODE -ne 0) { throw "Could not stage changes." }

$stagedChanges = git diff --cached --name-only
if (-not $stagedChanges) {
  Write-Host "No changes to commit." -ForegroundColor Yellow
  exit 0
}

git commit -m $Message
if ($LASTEXITCODE -ne 0) { throw "Commit failed." }

git push
if ($LASTEXITCODE -ne 0) { throw "Push failed." }

Write-Host "Deployment triggered successfully. Vercel will build the pushed commit." -ForegroundColor Green

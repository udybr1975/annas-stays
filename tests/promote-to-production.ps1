# promote-to-production.ps1
# Runs the automated test suite, then merges staging → main if all 11 steps pass.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Anna's Stays — Promote to Production" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$branch = git rev-parse --abbrev-ref HEAD
if ($branch -ne "staging") {
    Write-Host "ERROR: You must be on the staging branch to promote." -ForegroundColor Red
    Write-Host "Current branch: $branch" -ForegroundColor Red
    Write-Host "Run: git checkout staging" -ForegroundColor Yellow
    exit 1
}
Write-Host "Branch check: OK (staging)" -ForegroundColor Green

Write-Host ""
Write-Host "Pulling latest staging..." -ForegroundColor Yellow
git pull origin staging

Write-Host ""
Write-Host "Running automated test suite (11 steps)..." -ForegroundColor Yellow
Write-Host ""

$testResult = npx tsx tests/run-booking-test.ts 2>&1
Write-Host $testResult

$passed = $testResult | Select-String "11/11" | Select-Object -First 1
if (-not $passed) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  TESTS FAILED — Promotion blocked." -ForegroundColor Red
    Write-Host "  Fix all issues before promoting." -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "All 11 tests passed." -ForegroundColor Green

Write-Host ""
Write-Host "Ready to merge staging → main and push to production." -ForegroundColor Cyan
$confirm = Read-Host "Type YES to continue"
if ($confirm -ne "YES") {
    Write-Host "Promotion cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Merging staging → main..." -ForegroundColor Yellow
git checkout main
git pull origin main
git merge staging --no-ff -m "chore: promote staging to production"
git push origin main

git checkout staging
git push origin staging

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Promotion complete!" -ForegroundColor Green
Write-Host "  main pushed — anna-stays.fi deploying" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

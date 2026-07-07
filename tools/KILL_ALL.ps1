# ── Tự xin quyền Admin ───────────────────────────────────────
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Start-Process powershell -ArgumentList "-NoExit -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Clear-Host
Write-Host ""
Write-Host "  ====================================================" -ForegroundColor Red
Write-Host "    PaintMore AI  |  Kill All + Xoa Cache Ban Cu" -ForegroundColor Red
Write-Host "  ====================================================" -ForegroundColor Red
Write-Host ""

$WEB_DIR = "C:\xampp\htdocs"

# ── [1] Cloudflare Tunnel ─────────────────────────────────────
Write-Host "  [1] Dung Cloudflare Tunnel..." -ForegroundColor Cyan
Stop-Service Cloudflared -Force -ErrorAction SilentlyContinue
taskkill /F /IM cloudflared.exe /T 2>$null | Out-Null
Write-Host "        OK" -ForegroundColor Green

# ── [2] Dung Classifier (port 8189) + tan du FastAPI cu ──────
Write-Host "  [2] Dung Classifier (8189) + tan du FastAPI cu..." -ForegroundColor Cyan
$legacyPids = netstat -ano | Select-String ":8189 " | Select-String "LISTENING" |
              ForEach-Object { ($_ -split '\s+')[-1] } | Where-Object { $_ -match '^\d+$' }
foreach ($p in $legacyPids) { taskkill /F /PID $p /T 2>$null | Out-Null }
taskkill /F /IM uvicorn.exe /T 2>$null | Out-Null
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq 'python.exe' -and $_.CommandLine -like '*run_worker*' } |
    ForEach-Object { taskkill /F /PID $_.ProcessId /T 2>$null | Out-Null }
Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -like '*FastAPI*' -or
    $_.MainWindowTitle -like '*RQ Worker*' -or
    $_.MainWindowTitle -like '*PaintMore*' -or
    $_.MainWindowTitle -like '*Classifier*'
} | ForEach-Object { taskkill /F /PID $_.Id /T 2>$null | Out-Null }
Write-Host "        OK" -ForegroundColor Green

# ── [3] Don file dev tools cu ─────────────────────────────────
Write-Host "  [3] Don file dev tools cu..." -ForegroundColor Cyan
$toolsDir = $PSScriptRoot
@("add_hsv.php","regen_realistic.php","verify_colors.php","test_colors.php","add_ntc_names.py","RESTART_API.bat") |
    ForEach-Object {
        $f = Join-Path $toolsDir $_
        if (Test-Path $f) { Remove-Item $f -Force }
    }
Write-Host "        OK" -ForegroundColor Green

# ── [4] Xoa CACHE / LOG ban cu ────────────────────────────────
# Muc dich: khi dung dich vu, don sach tan du de lan START sau len that sach.
Write-Host "  [4] Xoa cache / log ban cu..." -ForegroundColor Cyan

# 4a. Log proxy + log tam.
@("api_proxy.log") | ForEach-Object {
    $f = Join-Path $WEB_DIR $_
    if (Test-Path $f) { try { Clear-Content $f -ErrorAction Stop } catch {} }
}

# 4b. File tam / cache local (neu co).
$tmpDirs = @("$WEB_DIR\tmp", "$WEB_DIR\temp", "$WEB_DIR\.cache")
foreach ($d in $tmpDirs) {
    if (Test-Path $d) { Get-ChildItem $d -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }
}

# 4c. Purge cache Cloudflare edge (neu co CF_API_TOKEN + CF_ZONE_ID).
#     => khi bat lai, edge khong con phuc vu ban cu.
if ($env:CF_API_TOKEN -and $env:CF_ZONE_ID) {
    try {
        $resp = Invoke-RestMethod -Method Post `
            -Uri "https://api.cloudflare.com/client/v4/zones/$($env:CF_ZONE_ID)/purge_cache" `
            -Headers @{ "Authorization" = "Bearer $($env:CF_API_TOKEN)"; "Content-Type" = "application/json" } `
            -Body '{"purge_everything":true}' -TimeoutSec 20
        if ($resp.success) { Write-Host "        OK - Da purge cache Cloudflare edge." -ForegroundColor Green }
        else { Write-Host "        WARN - Purge Cloudflare that bai." -ForegroundColor Red }
    } catch {
        Write-Host "        WARN - Khong goi duoc Cloudflare purge API." -ForegroundColor Red
    }
} else {
    Write-Host "        (Bo qua purge Cloudflare - chua dat CF_API_TOKEN/CF_ZONE_ID)" -ForegroundColor DarkGray
}
Write-Host "        OK - Da xoa log + file tam." -ForegroundColor Green

Write-Host ""
Write-Host "  ====================================================" -ForegroundColor Green
Write-Host "    XONG! Tunnel + Classifier da dung, cache/log da don." -ForegroundColor Green
Write-Host "    (Apache & ComfyUI KHONG bi dung - dung Services neu can.)" -ForegroundColor DarkGray
Write-Host "    Chay SETUP_AND_START.bat de deploy code moi + khoi dong lai." -ForegroundColor Green
Write-Host "  ====================================================" -ForegroundColor Green
Write-Host ""

Start-Sleep -Seconds 3

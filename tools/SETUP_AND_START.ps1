# ── Tự xin quyền Admin ───────────────────────────────────────
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Start-Process powershell -ArgumentList "-NoExit -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Clear-Host
Write-Host ""
Write-Host "  ====================================================" -ForegroundColor Green
Write-Host "    PaintMore AI  |  Setup & Start All Services" -ForegroundColor Green
Write-Host "    https://kellymoore-usa.com" -ForegroundColor Green
Write-Host "  ====================================================" -ForegroundColor Green
Write-Host ""

$WEB_DIR = "C:\xampp\htdocs"

# ── Tim Python 3.10+ (dung chung cho refresh code + venv) ─────
function Get-PythonExe {
    $candidates = @(
        "python", "python3",
        "C:\Python312\python.exe", "C:\Python311\python.exe", "C:\Python310\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
        "C:\AI_TT\ComfyUI_windows_portable_nvidia_cu126 (1)\ComfyUI_windows_portable\python_embeded\python.exe"
    )
    foreach ($c in $candidates) {
        try {
            $ver = & $c --version 2>&1
            if ($ver -match "Python 3\.(1[0-9]|[2-9]\d)") { return $c }
        } catch {}
    }
    return $null
}
$pythonExe = Get-PythonExe

# 1 token DUY NHAT cho ca lan deploy nay (JS imports + <script> + sw.js CACHE_NAME).
$token = Get-Date -Format 'yyyyMMddHHmmss'

# ════════════════════════════════════════════════════════════════
# 1. DEPLOY CODE MOI NHAT (cache-busting toan dien)
# ════════════════════════════════════════════════════════════════
# - stamp_version.py: dong dau ?v=token len MOI import JS + <script src> + register(sw.js)
#   => URL thanh cache key moi => Cloudflare/trinh duyet buoc tai code moi.
# - Bump CACHE_NAME trong sw.js => Service Worker o may khach ACTIVATE ban moi
#   va tu XOA cache cu (xem activate handler trong sw.js).
# - Xoa log proxy cu (tranh phinh to).
Write-Host "  [1/5] Deploy code moi + xoa cache ban cu..." -ForegroundColor Cyan

# Stamping thuan PowerShell — KHONG phu thuoc Python, khong bao gio skip.
# Dong dau ?v=token len: import trong js/**/*.js + <script src> + <link href css>
# + register(sw.js) trong index.html (giong het tools/stamp_version.py).
function Invoke-StampVersion([string]$tok) {
    $reImport = "(from\s+['`"])(\.\.?/[^'`"?]+\.js)(?:\?[^'`"]*)?(['`"])"
    $reSrc    = "(src=[`"'])(js/[^`"'?]+\.js)(?:\?[^`"']*)?([`"'])"
    $reCss    = "(href=[`"'])(css/[^`"'?]+\.css)(?:\?[^`"']*)?([`"'])"
    $reSw     = "(register\([`"'])(/sw\.js)(?:\?[^`"']*)?([`"'])"
    $rep      = ('${1}${2}?v=' + $tok + '${3}')
    $utf8     = New-Object System.Text.UTF8Encoding($false)
    $n = 0

    Get-ChildItem "$WEB_DIR\js" -Recurse -Filter *.js -ErrorAction SilentlyContinue | ForEach-Object {
        $src = [System.IO.File]::ReadAllText($_.FullName)
        $new = [regex]::Replace($src, $reImport, $rep)
        if ($new -ne $src) { [System.IO.File]::WriteAllText($_.FullName, $new, $utf8); $n++ }
    }
    $idx = "$WEB_DIR\index.html"
    if (Test-Path $idx) {
        $src = [System.IO.File]::ReadAllText($idx)
        $new = $src
        foreach ($re in @($reSrc, $reCss, $reSw)) { $new = [regex]::Replace($new, $re, $rep) }
        if ($new -ne $src) { [System.IO.File]::WriteAllText($idx, $new, $utf8); $n++ }
    }
    return $n
}

$stamped = $false
if ($pythonExe -and (Test-Path "$WEB_DIR\tools\stamp_version.py")) {
    & $pythonExe "$WEB_DIR\tools\stamp_version.py" $token
    if ($LASTEXITCODE -eq 0) {
        $stamped = $true
        Write-Host "        OK - Da dong dau version JS + CSS: v=$token" -ForegroundColor Green
    } else {
        Write-Host "        WARN - stamp_version.py loi (ma $LASTEXITCODE), dung fallback PowerShell..." -ForegroundColor Yellow
    }
}
if (-not $stamped) {
    $n = Invoke-StampVersion $token
    Write-Host "        OK - Da dong dau version (PowerShell) $n file: v=$token" -ForegroundColor Green
}

# Kiem tra chot: index.html PHAI tro token moi (JS + CSS), sai thi bao do ngay.
$idxHtml = [System.IO.File]::ReadAllText("$WEB_DIR\index.html")
if (($idxHtml -match [regex]::Escape("js?v=$token")) -and ($idxHtml -match [regex]::Escape("css?v=$token"))) {
    Write-Host "        OK - index.html da tro JS + CSS token moi." -ForegroundColor Green
} else {
    Write-Host "        LOI - index.html CHUA tro token moi! Khach se van thay ban cu." -ForegroundColor Red
}

# Bump CACHE_NAME trong sw.js -> client tu xoa cache cu khi vao lai.
$swFile = "$WEB_DIR\sw.js"
if (Test-Path $swFile) {
    try {
        $sw    = [System.IO.File]::ReadAllText($swFile)
        $swNew = [regex]::Replace($sw, 'const CACHE_NAME = "paint-more-[^"]*";', "const CACHE_NAME = `"paint-more-$token`";")
        if ($swNew -ne $sw) {
            [System.IO.File]::WriteAllText($swFile, $swNew, (New-Object System.Text.UTF8Encoding($false)))
            Write-Host "        OK - Bump sw.js CACHE_NAME: paint-more-$token (client se xoa cache cu)." -ForegroundColor Green
        } else {
            Write-Host "        WARN - Khong thay dong CACHE_NAME trong sw.js de bump." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "        WARN - Loi khi bump sw.js: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Xoa log proxy cu.
$proxyLog = "$WEB_DIR\api_proxy.log"
if (Test-Path $proxyLog) {
    try { Clear-Content $proxyLog -ErrorAction Stop; Write-Host "        OK - Da xoa api_proxy.log cu." -ForegroundColor Green } catch {}
}

# (Tuy chon) Purge cache Cloudflare neu co CF_API_TOKEN + CF_ZONE_ID trong env.
#   setx CF_API_TOKEN "..."   va   setx CF_ZONE_ID "..."
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
Write-Host ""

# ════════════════════════════════════════════════════════════════
# 2. APACHE XAMPP (restart = clear PHP opcache -> chac chan chay code moi)
# ════════════════════════════════════════════════════════════════
Write-Host "  [2/5] Apache XAMPP (port 80)..." -ForegroundColor Cyan

$apacheSvc = Get-Service -Name "Apache2.4" -ErrorAction SilentlyContinue
if (-not $apacheSvc) {
    Write-Host "        Cai Apache service lan dau..." -ForegroundColor Yellow
    & "C:\xampp\apache\bin\httpd.exe" -k install -n "Apache2.4" | Out-Null
    & sc.exe config Apache2.4 start= auto | Out-Null
}
$apacheSvc = Get-Service -Name "Apache2.4" -ErrorAction SilentlyContinue
if ($apacheSvc.Status -ne "Running") {
    Start-Service -Name "Apache2.4" -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
} else {
    # Restart de nap code/.htaccess moi + xoa PHP opcache ban cu.
    & "C:\xampp\apache\bin\httpd.exe" -k restart -n "Apache2.4" 2>$null | Out-Null
    Start-Sleep -Seconds 1
}
$port80 = netstat -ano | Select-String ":80 " | Select-String "LISTENING"
if ($port80) {
    Write-Host "        OK - Apache dang chay (port 80), opcache da reset." -ForegroundColor Green
} else {
    Write-Host "        WARN - Port 80 chua lang nghe!" -ForegroundColor Red
}
Write-Host ""

# ════════════════════════════════════════════════════════════════
# 3. CLASSIFIER (nhan dien kien truc — best.pt qua timm, port 8190)
# ════════════════════════════════════════════════════════════════
Write-Host "  [3/5] Classifier (best.pt, port 8190)..." -ForegroundColor Cyan

$CLASSIFY_PY  = "C:\AI_TT\ComfyUI_windows_portable_nvidia_cu126\ComfyUI_windows_portable\python_embeded\python.exe"
$CLASSIFY_DIR = "C:\xampp\htdocs\clasify"
if (Test-Path $CLASSIFY_PY) {
    # Kill tien trinh cu tren 8190 de nap ban moi
    $oldPid = netstat -ano | Select-String ":8190 " | Select-String "LISTENING" |
              ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -First 1
    if ($oldPid -and $oldPid -match '^\d+$') {
        Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
    $psiC = New-Object System.Diagnostics.ProcessStartInfo
    $psiC.FileName         = "cmd.exe"
    $psiC.Arguments        = "/k title [Classifier] PaintMore :8190 && set CLASSIFY_PORT=8190 && `"$CLASSIFY_PY`" `"$CLASSIFY_DIR\classify_server.py`""
    $psiC.WorkingDirectory = $CLASSIFY_DIR
    $psiC.WindowStyle      = [System.Diagnostics.ProcessWindowStyle]::Normal
    $psiC.UseShellExecute  = $true
    [System.Diagnostics.Process]::Start($psiC) | Out-Null
    # best.pt ~1GB nap TRUOC khi server mo cong => /health tra loi = model da san
    # sang. Cho toi 90s de tranh mo web khi classifier CHUA san (bam Nhan dien se lag).
    Write-Host "        Dang nap model best.pt (~1GB), cho classifier san sang..." -ForegroundColor DarkGray
    $ready = $false
    for ($i = 0; $i -lt 45; $i++) {
        try {
            $h = Invoke-WebRequest -Uri "http://127.0.0.1:8190/health" -UseBasicParsing -TimeoutSec 2
            if ($h.StatusCode -eq 200) { $ready = $true; break }
        } catch {}
        Start-Sleep -Seconds 2
    }
    if ($ready) {
        Write-Host "        OK - Classifier SAN SANG (/health 200, model da nap)." -ForegroundColor Green
    } else {
        Write-Host "        WARN - Classifier chua san sang sau 90s (kiem tra cua so [Classifier])." -ForegroundColor Yellow
    }
} else {
    Write-Host "        WARN - Khong thay python_embeded cua ComfyUI. Bo qua classifier." -ForegroundColor Red
}
Write-Host ""

# ════════════════════════════════════════════════════════════════
# 4. CLOUDFLARE TUNNEL
# ════════════════════════════════════════════════════════════════
Write-Host "  [4/5] Cloudflare Tunnel..." -ForegroundColor Cyan

$correctPath = '"C:\Users\SERVER\cloudflared.exe" tunnel --config "C:\Users\SERVER\.cloudflared\config.yml" run km-tunnel'
$currentPath = (Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\Cloudflared" -Name ImagePath -ErrorAction SilentlyContinue).ImagePath
if ($currentPath -ne $correctPath) {
    Write-Host "        Sua service binPath..." -ForegroundColor Yellow
    Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\Cloudflared" -Name ImagePath -Value $correctPath
}

taskkill /F /IM cloudflared.exe /T 2>$null | Out-Null
Start-Sleep -Seconds 2

Start-Service Cloudflared -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5

$cfSvc = Get-Service -Name "Cloudflared" -ErrorAction SilentlyContinue
if ($cfSvc.Status -eq "Running") {
    Write-Host "        OK - Tunnel service dang chay." -ForegroundColor Green
} else {
    Write-Host "        Thu khoi dong tunnel thu cong..." -ForegroundColor Yellow
    $psi3 = New-Object System.Diagnostics.ProcessStartInfo
    $psi3.FileName        = "C:\Users\SERVER\cloudflared.exe"
    $psi3.Arguments       = 'tunnel --config "C:\Users\SERVER\.cloudflared\config.yml" run km-tunnel'
    $psi3.WindowStyle     = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psi3.UseShellExecute = $true
    [System.Diagnostics.Process]::Start($psi3) | Out-Null
    Start-Sleep 5
    Write-Host "        Tunnel da duoc khoi dong." -ForegroundColor Green
}
Write-Host ""

# ════════════════════════════════════════════════════════════════
# 5. PRE-WARM CACHE CLOUDFLARE (QUAN TRONG cho "mo web lan dau")
# ════════════════════════════════════════════════════════════════
# Sau khi stamp token moi, MOI URL JS thanh cache key moi => edge Cloudflare
# TRONG (cache lanh). Neu khong lam nong, NGUOI VAO DAU TIEN phai keo ~30 file
# tu may nay qua tunnel => "quay that lau". O day ta tu tai truoc qua domain
# public de edge nong san, khach that vao se HIT ngay.
Write-Host "  [5/5] Lam nong cache Cloudflare (pre-warm)..." -ForegroundColor Cyan
try {
    $html = (Invoke-WebRequest -Uri "http://localhost/index.html" -UseBasicParsing -TimeoutSec 10).Content
    if ($html -match "v=$token") {
        Write-Host "        OK - index.html tro token moi v=$token." -ForegroundColor Green
    } else {
        Write-Host "        WARN - index.html chua co token moi (kiem tra stamp)." -ForegroundColor Yellow
    }

    # Tap hop tai nguyen can lam nong:
    #  - MOI file .js (import module deu dung ?v=$token sau khi stamp)
    #  - CSS + index + manifest + workflow lay dung URL ?v tu index.html
    $assets = New-Object System.Collections.Generic.List[string]
    Get-ChildItem "$WEB_DIR\js" -Recurse -Filter *.js -ErrorAction SilentlyContinue | ForEach-Object {
        $rel = $_.FullName.Substring($WEB_DIR.Length).Replace('\','/')
        $assets.Add("$rel`?v=$token")
    }
    # CSS/JSON co ?v thu cong trong index.html -> lay nguyen URL do
    [regex]::Matches($html, '(?:href|src)="((?:css|data)/[^"]+\?v=[^"]+)"') | ForEach-Object { $assets.Add("/" + $_.Groups[1].Value) }
    $assets.Add("/index.html"); $assets.Add("/"); $assets.Add("/manifest.json")

    $warm = 0; $fail = 0
    foreach ($a in ($assets | Select-Object -Unique)) {
        $u = if ($a.StartsWith("/")) { "https://kellymoore-usa.com$a" } else { "https://kellymoore-usa.com/$a" }
        try {
            Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 30 -Headers @{ "Accept-Encoding" = "gzip, br" } | Out-Null
            $warm++
        } catch { $fail++ }
    }
    Write-Host "        OK - Da lam nong $warm tai nguyen tren edge ($fail loi)." -ForegroundColor Green
} catch {
    Write-Host "        WARN - Khong pre-warm duoc (site chua san sang?): $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host ""

# ════════════════════════════════════════════════════════════════
# DONE
# ════════════════════════════════════════════════════════════════
Write-Host "  ====================================================" -ForegroundColor Green
Write-Host "    XONG! Tat ca dich vu da duoc khoi dong." -ForegroundColor Green
Write-Host ""
Write-Host "    Web:      https://kellymoore-usa.com"    -ForegroundColor White
Write-Host "    ComfyUI:  https://comfy.kellymoore-usa.com" -ForegroundColor White
Write-Host ""
Write-Host "    Deploy:   token v=$token (JS + sw.js CACHE_NAME)" -ForegroundColor Gray
Write-Host "    Cache:    client tu xoa ban cu qua Service Worker; JS immutable + edge da pre-warm." -ForegroundColor Gray
Write-Host "              => Khach vao lan dau sau start KHONG con phai cho keo file qua tunnel." -ForegroundColor Gray
Write-Host "  ====================================================" -ForegroundColor Green
Write-Host ""

Start-Sleep -Seconds 3
Start-Process "https://kellymoore-usa.com"

Write-Host ""
Write-Host "  Nhan phim bat ky de dong cua so nay..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

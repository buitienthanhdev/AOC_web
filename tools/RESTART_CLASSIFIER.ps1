# Restart classifier (best.pt, port 8190) — dung khi server ket cung.
# Chay voi quyen Administrator (tien trinh cu thuong duoc start elevated).
$ErrorActionPreference = "Continue"

$oldPid = netstat -ano | Select-String ":8190\s" | Select-String "LISTENING" |
          ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -First 1
if ($oldPid -and $oldPid -match '^\d+$') {
    Write-Host "Killing old classifier PID $oldPid..."
    taskkill /PID $oldPid /F | Out-Host
    Start-Sleep -Seconds 1
}

$CLASSIFY_PY  = "C:\AI_TT\ComfyUI_windows_portable_nvidia_cu126\ComfyUI_windows_portable\python_embeded\python.exe"
$CLASSIFY_DIR = "C:\xampp\htdocs\clasify"

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName         = "cmd.exe"
$psi.Arguments        = "/k title [Classifier] PaintMore :8190 && set CLASSIFY_PORT=8190 && `"$CLASSIFY_PY`" `"$CLASSIFY_DIR\classify_server.py`""
$psi.WorkingDirectory = $CLASSIFY_DIR
$psi.WindowStyle      = [System.Diagnostics.ProcessWindowStyle]::Minimized
$psi.UseShellExecute  = $true
[System.Diagnostics.Process]::Start($psi) | Out-Null

Write-Host "Dang nap model best.pt, cho /health..."
for ($i = 0; $i -lt 45; $i++) {
    try {
        $h = Invoke-WebRequest -Uri "http://127.0.0.1:8190/health" -UseBasicParsing -TimeoutSec 2
        if ($h.StatusCode -eq 200) { Write-Host "Classifier SAN SANG."; exit 0 }
    } catch {}
    Start-Sleep -Seconds 2
}
Write-Host "WARN: classifier chua tra loi /health sau 90s."

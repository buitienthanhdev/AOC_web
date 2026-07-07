@echo off
REM ====================================================================
REM  PaintMore AI - Kill All + Xoa Cache Ban Cu
REM  Launcher: goi KILL_ALL.ps1 (script tu xin quyen Admin).
REM  Se dung Cloudflare Tunnel + Classifier, dong file dev cu, va
REM  XOA cache/log ban cu (api_proxy.log, tmp) + purge Cloudflare
REM  (neu co CF_API_TOKEN/CF_ZONE_ID) => lan START sau len that sach.
REM ====================================================================
title PaintMore AI - Kill All

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0KILL_ALL.ps1"

if errorlevel 1 (
    echo.
    echo [!] Co loi khi chay PowerShell script. Xem thong bao phia tren.
    pause
)

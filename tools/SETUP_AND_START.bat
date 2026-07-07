@echo off
REM ====================================================================
REM  PaintMore AI - Setup & Start All Services
REM  Launcher: goi SETUP_AND_START.ps1 (script tu xin quyen Admin).
REM  Moi lan chay se:
REM    - Dong dau version moi (stamp_version.py) + bump sw.js CACHE_NAME
REM      => client tu XOA cache ban cu, LUON nhan code moi nhat.
REM    - Restart Apache (clear PHP opcache), xoa log cu.
REM    - (Tuy chon) purge Cloudflare neu co CF_API_TOKEN/CF_ZONE_ID.
REM ====================================================================
title PaintMore AI - Setup ^& Start

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SETUP_AND_START.ps1"

if errorlevel 1 (
    echo.
    echo [!] Co loi khi chay PowerShell script. Xem thong bao phia tren.
    pause
)

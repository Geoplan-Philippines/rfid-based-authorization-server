@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\restore-db.ps1" %*
exit /b %ERRORLEVEL%

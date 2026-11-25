@echo off
where python >nul 2>nul
if errorlevel 1 (
  py -3 "%~dp0run.py" %*
) else (
  python "%~dp0run.py" %*
)
if errorlevel 1 pause

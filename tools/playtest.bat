@echo off
REM Ruckus — start a playtest from Windows, with no WSL terminal to open first.
REM
REM Run it, or make a desktop shortcut to it. Both servers run inside WSL (that is
REM where the repo and node_modules live); the game is played in a browser.
REM
REM The repo path is derived from where this file sits, so a clone anywhere works —
REM cmd cannot use a UNC path as a working directory, but wslpath can translate one.
REM Override DISTRO below if your distribution is named differently.

setlocal
if "%RUCKUS_DISTRO%"=="" (set DISTRO=Ubuntu-24.04) else (set DISTRO=%RUCKUS_DISTRO%)

echo.
echo   Ruckus - starting the playtest in WSL...
echo.

REM %~dp0 is this file's folder as a Windows/UNC path; wslpath turns it into the Linux
REM path WSL needs, and `..` steps up from tools/ to the repo root.
wsl.exe -d %DISTRO% -- bash -c "cd \"$(wslpath -u '%~dp0')/..\" && bash tools/playtest.sh --open --lan"

REM The script runs in the foreground and cleans up after itself, so reaching this line
REM means it exited. It prints its own explanation before returning.
endlocal

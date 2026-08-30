@echo off
REM Ruckus — start a playtest from Windows, with no WSL terminal to open first.
REM
REM Run from cmd, or make a desktop shortcut to it:
REM     \\wsl.localhost\Ubuntu-24.04\home\jerwin\projects\Ruckus\tools\playtest.bat
REM
REM Both servers run inside WSL (that is where the repo and node_modules live). The game
REM is played in a browser — on this machine, and on any phone once tools\lan-setup.ps1
REM has been run once as Administrator.
REM
REM Closing the window stops both servers.
REM
REM Does NOT cd into its own folder: cmd cannot use a UNC path as a working directory,
REM so the repo path below is absolute.

setlocal
set DISTRO=Ubuntu-24.04
set REPO=/home/jerwin/projects/Ruckus
set CLIENT_PORT=5173

echo.
echo   Ruckus - starting the playtest in WSL...
echo.

REM --open makes the script hand the URL to the default browser once the client is up,
REM so there is nothing to copy by hand.
wsl.exe -d %DISTRO% --cd %REPO% -- bash tools/playtest.sh --open --lan

REM The script above runs in the foreground and cleans up after itself, so reaching this
REM line means it exited. It prints its own explanation before returning.
endlocal

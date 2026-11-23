@echo off
title Swipe Studio - Dashboard Local
cd /d "%~dp0"
start "" http://127.0.0.1:3456
node server.mjs
pause

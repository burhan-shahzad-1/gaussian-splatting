@echo off
cd /d "%~dp0\..\reconstructor"
".venv\Scripts\python.exe" -u process.py poll

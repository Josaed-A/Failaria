@echo off
REM Inicia la plataforma con un servidor local (requiere Python) y abre el navegador.
cd /d "%~dp0"
start "" http://localhost:8000
python -m http.server 8000

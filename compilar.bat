@echo off
setlocal
echo ===================================================
echo   MultiChat Integrator - Compilador Windows (.exe)
echo ===================================================
echo.

cd /d "%~dp0"

echo [1/3] Instalando/Verificando dependencias...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha ao instalar dependencias.
    pause
    exit /b %errorlevel%
)

echo.
echo [2/3] Compilando e gerando o instalador (electron-builder)...
call npm run build:win
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha ao gerar o executavel/instalador.
    pause
    exit /b %errorlevel%
)

echo.
echo ===================================================
echo   SUCESSO! Os instaladores e o arquivo latest.yml
echo   foram gerados na pasta:
echo   dist\
echo ===================================================
echo.
pause

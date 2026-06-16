@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Subiendo fotos del Salon de la Fama FIM
echo ============================================
echo.

echo [1/3] Importando fotos nuevas...
call npm run import:hof
echo.

echo [2/3] Guardando cambios...
git add -A
git commit -m "fotos: actualizar Salon de la Fama" || echo (No habia cambios que guardar)
echo.

echo [3/3] Subiendo a la web...
git push

echo.
echo ============================================
echo   LISTO. Ya se estan actualizando en la web.
echo ============================================
echo.
pause

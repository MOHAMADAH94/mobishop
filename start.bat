@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title MobiShop - Start
color 0B

echo.
echo ========================================
echo   MobiShop - Full local start
echo ========================================
echo.

set "PY="
where python >nul 2>&1
if not errorlevel 1 set "PY=python"
if not defined PY (
  where py >nul 2>&1
  if not errorlevel 1 set "PY=py -3"
)
if not defined PY (
  echo [ERROR] Python not found in PATH.
  echo Install Python 3.11 or 3.12 and enable "Add to PATH".
  echo.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found in PATH.
  echo Install Node.js LTS from nodejs.org
  echo.
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found. Reinstall Node.js.
  echo.
  pause
  exit /b 1
)

echo [1/5] Python and Node OK.
%PY% --version
node --version
echo.

if not exist "backend\.env" (
  if exist "backend\.env.example" (
    copy /y "backend\.env.example" "backend\.env" >nul
    echo [2/5] Created backend\.env
  ) else (
    echo [ERROR] Missing backend\.env.example
    pause
    exit /b 1
  )
) else (
  echo [2/5] backend\.env exists.
)

if not exist "frontend\.env" (
  if exist "frontend\.env.example" (
    copy /y "frontend\.env.example" "frontend\.env" >nul
    echo       Created frontend\.env
  )
)

echo.
echo [3/5] Django setup...
if not exist "backend\venv\Scripts\python.exe" (
  echo       Creating venv and installing packages...
  %PY% -m venv backend\venv
  if errorlevel 1 (
    echo [ERROR] Failed to create virtual environment.
    pause
    exit /b 1
  )
  call :pip_install
  if errorlevel 1 exit /b 1
) else (
  "backend\venv\Scripts\python.exe" -c "import django" 2>nul
  if errorlevel 1 (
    echo       Installing missing Python packages...
    call :pip_install
    if errorlevel 1 exit /b 1
  ) else (
    echo       Virtual environment ready.
  )
)

pushd backend
echo       Running migrations...
"venv\Scripts\python.exe" manage.py migrate --noinput
if errorlevel 1 (
  popd
  echo [ERROR] Migrations failed. Check backend\.env
  pause
  exit /b 1
)

if not exist ".local_seeded" (
  echo       Seeding local demo data...
  "venv\Scripts\python.exe" manage.py seed_demo
  if not errorlevel 1 echo.>" .local_seeded"
)
popd

echo.
echo [4/5] Frontend setup...
if not exist "frontend\node_modules\" (
  echo       Running npm install...
  pushd frontend
  call npm install
  if errorlevel 1 (
    popd
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
  popd
) else (
  echo       node_modules exists.
)

echo.
echo [5/5] Starting servers...
echo.
echo   App     http://localhost:5173
echo   API     http://127.0.0.1:8000
echo   Admin   http://127.0.0.1:8000/admin/
echo.
echo Keep the Backend and Frontend windows open while working.
echo Close them to stop the project.
echo.

start "MobiShop Backend" /D "%~dp0backend" cmd /k "venv\Scripts\python.exe manage.py runserver 8000"
start "MobiShop Frontend" /D "%~dp0frontend" cmd /k "npm run dev"

echo Waiting for Vite, then opening browser...
timeout /t 5 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo Done. You may close this window.
echo.
pause
exit /b 0

:pip_install
"backend\venv\Scripts\python.exe" -m pip install --upgrade pip -q
"backend\venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
if errorlevel 1 (
  echo [ERROR] pip install failed.
  pause
  exit /b 1
)
exit /b 0

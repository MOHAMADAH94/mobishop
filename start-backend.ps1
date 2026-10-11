# تشغيل خادم Django
Set-Location $PSScriptRoot\backend
if (-not (Test-Path ".\venv\Scripts\python.exe")) {
    Write-Host "Creating virtual environment..."
    python -m venv venv
    .\venv\Scripts\pip install -r requirements.txt -q
}
if (-not (Test-Path ".\db.sqlite3")) {
    Write-Host "Running migrations..."
    .\venv\Scripts\python manage.py migrate
    .\venv\Scripts\python manage.py seed_demo
}
Write-Host "Starting Django on http://127.0.0.1:8000"
.\venv\Scripts\python manage.py runserver 8000

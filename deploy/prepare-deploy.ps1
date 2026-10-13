# Prepare full production deployment zips for Namecheap
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "Building frontend..."
Push-Location "$root\frontend"
if (-not (Test-Path ".env.production")) {
    "VITE_API_URL=https://api.mobishop.online/api" | Out-File -Encoding utf8 .env.production
}
npm run build
Pop-Location

$deployDir = "$root\deploy\out"
if (Test-Path $deployDir) { Remove-Item $deployDir -Recurse -Force }
New-Item -ItemType Directory -Path $deployDir | Out-Null

$buildId = Get-Date -Format "yyyy-MM-dd_HH-mm"
$jsBundle = Get-ChildItem "$root\frontend\dist\assets\index-*.js" | Select-Object -First 1
$jsName = if ($jsBundle) { $jsBundle.Name } else { "unknown" }

Write-Host "Packaging backend..."
$backendTemp = "$deployDir\backend_temp"
New-Item -ItemType Directory -Path $backendTemp | Out-Null

$exclude = @('venv', '__pycache__', 'staticfiles', 'media', 'db.sqlite3', '.env')
Get-ChildItem "$root\backend" -Directory | Where-Object { $exclude -notcontains $_.Name } | ForEach-Object {
    Copy-Item $_.FullName -Destination "$backendTemp\$($_.Name)" -Recurse -Force
}
$backendFiles = @('manage.py', 'requirements.txt', 'requirements-hosting.txt')
foreach ($f in $backendFiles) {
    if (Test-Path "$root\backend\$f") {
        Copy-Item "$root\backend\$f" -Destination $backendTemp -Force
    }
}
if (Test-Path "$root\deploy\env.production.example") {
    Copy-Item "$root\deploy\env.production.example" -Destination "$backendTemp\.env.example" -Force
}

Get-ChildItem $backendTemp -Recurse -Directory -Filter __pycache__ | Remove-Item -Recurse -Force
Get-ChildItem $backendTemp -Recurse -Directory -Filter .gradle | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem $backendTemp -Recurse -File -Filter *.log | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem $backendTemp -Recurse -File -Filter *.pyc | Remove-Item -Force -ErrorAction SilentlyContinue
# Shared hosting does not build APKs; drop Gradle wrapper jars that may be locked by a local JDK.
$androidTpl = "$backendTemp\store_app\android_template"
if (Test-Path $androidTpl) {
    Get-ChildItem $androidTpl -Recurse -Directory -Filter .gradle | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Get-ChildItem $androidTpl -Recurse -File -Include *.lock,*.bin | Remove-Item -Force -ErrorAction SilentlyContinue
}

$buildInfo = @"
Mobishop build $buildId
Frontend bundle: $jsName

=== This build ===
POS payment totals/amounts now up to 4dp (was stuck at 2dp)
Sale money fields + customer.debt: decimal_places=4
Sell price + qty precision up to 4dp
Migrations REQUIRED:
  products.0011+0012, sales.0011+0012+0013, purchases.0006, customers.0004

=== Modules ===
Core: POS, products, inventory, customers, suppliers, purchases, repairs, expenses, multi-currency, roles, cashbox
Smart Business: decision center, profit intelligence, AI assistant
Store Catalog: /shop/{slug}, categories, product publish, owner settings
Marketplace: /marketplace, stores directory, global products, offers, /product/{slug}
Analytics: store/product views for store owners

=== After extract (backend) ===
KEEP existing .env — do not overwrite
pip install -r requirements-hosting.txt
python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py fix_roles
python manage.py generate_recommendations
touch tmp/restart.txt
Restart Python App in cPanel

=== Super Admin ===
Open /admin/ for reports dashboard
Enable Store.catalog_enabled per store; set StoreCatalogProfile.featured for marketplace
Enable Store.store_app_enabled for Android app feature

See deploy/FEATURES-AND-UPDATES.md for full changelog.
"@
$buildInfo | Out-File -Encoding utf8 "$backendTemp\BUILD_INFO.txt"

function Compress-FolderContents {
    param([string]$SourceDir, [string]$ZipPath)
    if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::Open($ZipPath, 'Create')
    try {
        $rootFull = (Resolve-Path $SourceDir).Path.TrimEnd('\')
        Get-ChildItem $SourceDir -Recurse -File | ForEach-Object {
            $entry = $_.FullName.Substring($rootFull.Length + 1).Replace('\', '/')
            try {
                [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entry, 'Optimal')
            } catch {
                Write-Warning "Skip locked file: $entry"
            }
        }
    } finally {
        $zip.Dispose()
    }
}

Compress-FolderContents -SourceDir $backendTemp -ZipPath "$deployDir\backend-full.zip"
Start-Sleep -Milliseconds 500
Remove-Item $backendTemp -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Packaging frontend..."
$frontendTemp = "$deployDir\frontend_temp"
New-Item -ItemType Directory -Path $frontendTemp | Out-Null
Copy-Item "$root\frontend\dist\*" -Destination $frontendTemp -Recurse -Force
if (Test-Path "$root\deploy\frontend.htaccess") {
    Copy-Item "$root\deploy\frontend.htaccess" -Destination "$frontendTemp\.htaccess" -Force
}

@"
Mobishop frontend build $buildId
JS bundle: $jsName
Extract directly into public_html (index.html at root)
"@ | Out-File -Encoding utf8 "$frontendTemp\BUILD_INFO.txt"

Compress-Archive -Path "$frontendTemp\*" -DestinationPath "$deployDir\frontend-full.zip" -Force
Start-Sleep -Milliseconds 500
Remove-Item $frontendTemp -Recurse -Force -ErrorAction SilentlyContinue

$buildInfo | Out-File -Encoding utf8 "$deployDir\BUILD_INFO.txt"
if (Test-Path "$root\deploy\FEATURES-AND-UPDATES.md") {
    Copy-Item "$root\deploy\FEATURES-AND-UPDATES.md" -Destination "$deployDir\FEATURES-AND-UPDATES.md" -Force
}
if (Test-Path "$root\deploy\UPDATE-SERVER.md") {
    Copy-Item "$root\deploy\UPDATE-SERVER.md" -Destination "$deployDir\UPDATE-SERVER.md" -Force
}
foreach ($script in @('fix-api-500.sh', 'update-after-upload.sh', 'server-full-deploy.sh')) {
    $src = "$root\deploy\$script"
    if (Test-Path $src) { Copy-Item $src -Destination "$deployDir\$script" -Force }
}

Write-Host ""
Write-Host "Build ID: $buildId"
Write-Host "Frontend JS: $jsName"
Write-Host ""
Write-Host "Ready in $deployDir :"
Write-Host "  backend-full.zip"
Write-Host "  frontend-full.zip"
Write-Host "  BUILD_INFO.txt"
Write-Host "  FEATURES-AND-UPDATES.md"
Write-Host "  UPDATE-SERVER.md"

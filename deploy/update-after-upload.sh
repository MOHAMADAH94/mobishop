#!/bin/bash
set -e
APP="${1:-$HOME/api.mobishop.online}"
VENV="${2:-$HOME/virtualenv/api.mobishop.online/3.11}"
cd "$APP"
source "$VENV/bin/activate"
pip install -r requirements-hosting.txt -q
python manage.py migrate --noinput
python manage.py fix_roles
python manage.py generate_recommendations 2>/dev/null || true
python manage.py collectstatic --noinput 2>/dev/null || true
mkdir -p tmp && touch tmp/restart.txt
echo "OK - Restart Python App in cPanel"

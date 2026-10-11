#!/bin/bash
set -e
APP="$HOME/api.mobishop.online"
VENV="$HOME/virtualenv/api.mobishop.online/3.11"
USER_HOME="${HOME##*/}"
cd "$APP" || exit 1
cat > .htaccess << HTEOF
PassengerAppRoot "/home/${USER_HOME}/api.mobishop.online"
PassengerBaseURI "/"
PassengerPython "/home/${USER_HOME}/virtualenv/api.mobishop.online/3.11/bin/python"
PassengerAppType wsgi
PassengerStartupFile passenger_wsgi.py
HTEOF
source "$VENV/bin/activate"
pip install -r requirements-hosting.txt -q
python manage.py migrate --noinput
python manage.py fix_roles
mkdir -p tmp && touch tmp/restart.txt
echo "OK ΓÇö Restart Python App in cPanel"

import os
import sys
import traceback

APP_ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, APP_ROOT)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

_LOG = os.path.join(APP_ROOT, 'passenger_error.log')


def _log_error(exc: BaseException) -> None:
    try:
        with open(_LOG, 'a', encoding='utf-8') as f:
            f.write('\n--- startup error ---\n')
            traceback.print_exc(file=f)
    except OSError:
        pass


try:
    from config.wsgi import application
except Exception as exc:
    _log_error(exc)
    raise

from django.apps import AppConfig


class StoreAppConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'store_app'
    verbose_name = 'تطبيق متجرك'

    def ready(self):
        try:
            from store_app.services import ensure_apk_dir_protected
            ensure_apk_dir_protected()
        except Exception:  # noqa: BLE001 — media folder may be missing or read-only
            pass

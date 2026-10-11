MobiShop Store Android WebView template
=======================================

Placeholders injected at build time:
  __APP_NAME__
  __PACKAGE_NAME__
  __STORE_URL__
  __PRIMARY_COLOR__   (hex without #)
  __VERSION_NAME__
  __VERSION_CODE__

For real APKs on a build worker:
  1. Install Android SDK + JDK 17
  2. Add Gradle wrapper (gradle wrapper) or copy from another Android project
  3. Set STORE_APP_MOCK_BUILD=false
  4. Run: python manage.py process_store_app_builds

Mock mode (default) packages a placeholder .apk for API/e2e testing without SDK.

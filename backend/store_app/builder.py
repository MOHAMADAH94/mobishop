"""Android APK build pipeline — isolated from request thread.

Uses STORE_APP_MOCK_BUILD=true to produce a placeholder APK when the Android SDK
is not available (shared hosting / CI). Real Gradle builds run when mock is off
and the template + SDK are configured.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from django.utils import timezone

logger = logging.getLogger('store_app.builder')


def _template_dir() -> Path:
    configured = getattr(settings, 'STORE_APP_ANDROID_TEMPLATE_DIR', None)
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parent / 'android_template'


def _android_sdk_path() -> Path | None:
    configured = getattr(settings, 'ANDROID_SDK_ROOT', None) or getattr(settings, 'ANDROID_HOME', None)
    candidates = []
    if configured:
        candidates.append(Path(configured))
    local = Path(os.environ.get('LOCALAPPDATA', '')) / 'Android' / 'Sdk'
    candidates.extend([
        local,
        Path.home() / 'Android' / 'Sdk',
        Path('/opt/android-sdk'),
    ])
    for path in candidates:
        if path and path.is_dir() and (path / 'platforms').is_dir():
            return path
    return None


def _mock_enabled() -> bool:
    explicit = getattr(settings, 'STORE_APP_MOCK_BUILD', None)
    if explicit is not None:
        return bool(explicit)
    return _android_sdk_path() is None


def _write_local_properties(work: Path) -> None:
    sdk = _android_sdk_path()
    if not sdk:
        return
    props = work / 'local.properties'
    props.write_text(f'sdk.dir={sdk.as_posix()}\n', encoding='utf-8')


def _write_placeholders(work: Path, build) -> None:
    """Replace tokens in key Android project files."""
    replacements = {
        '__APP_NAME__': build.app_name,
        '__PACKAGE_NAME__': build.package_name,
        '__STORE_URL__': build.store_url,
        '__PRIMARY_COLOR__': (build.primary_color or '#0F766E').lstrip('#'),
        '__VERSION_NAME__': build.version_name,
        '__VERSION_CODE__': str(build.version_code),
    }

    for path in work.rglob('*'):
        if not path.is_file():
            continue
        if path.suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp', '.jar', '.so'}:
            continue
        try:
            text = path.read_text(encoding='utf-8')
        except (UnicodeDecodeError, OSError):
            continue
        original = text
        for key, value in replacements.items():
            text = text.replace(key, value)
        if text != original:
            path.write_text(text, encoding='utf-8')

    icon_dest = (
        work / 'app' / 'src' / 'main' / 'res' / 'mipmap-xxxhdpi' / 'ic_launcher.png'
    )
    for density in ('mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'):
        (work / 'app' / 'src' / 'main' / 'res' / density).mkdir(parents=True, exist_ok=True)
    if build.app_icon:
        try:
            with build.app_icon.open('rb') as src:
                icon_bytes = src.read()
            for density in ('mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'):
                dest = work / 'app' / 'src' / 'main' / 'res' / density / 'ic_launcher.png'
                with open(dest, 'wb') as dst:
                    dst.write(icon_bytes)
        except OSError as exc:
            logger.warning('Could not copy app icon: %s', exc)
    elif not icon_dest.exists():
        icon_dest.write_bytes(
            bytes.fromhex(
                '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489'
                '0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082'
            )
        )


def _relocate_java_sources(work: Path, package_name: str) -> None:
    """Move injected MainActivity.java into the package directory tree."""
    java_root = work / 'app' / 'src' / 'main' / 'java'
    sources = list(java_root.rglob('*.java'))
    if not sources:
        return
    dest_dir = java_root.joinpath(*package_name.split('.'))
    dest_dir.mkdir(parents=True, exist_ok=True)
    for src in sources:
        target = dest_dir / src.name
        if src.resolve() != target.resolve():
            shutil.move(str(src), str(target))
    for path in sorted(java_root.rglob('*'), reverse=True):
        if path.is_dir():
            try:
                path.rmdir()
            except OSError:
                pass


def _make_mock_apk(work: Path, build) -> Path:
    """Create a downloadable ZIP-based placeholder labeled as .apk for environments without SDK."""
    out = work / 'app' / 'build' / 'outputs' / 'apk' / 'debug'
    out.mkdir(parents=True, exist_ok=True)
    apk_path = out / f'{build.package_name}-v{build.version_code}.apk'
    with zipfile.ZipFile(apk_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            'META-INF/MOBISHOP.txt',
            (
                f'MobiShop Store App placeholder\n'
                f'app_name={build.app_name}\n'
                f'package={build.package_name}\n'
                f'store_url={build.store_url}\n'
                f'version={build.version_name} ({build.version_code})\n'
                f'NOTE=Enable real Gradle builds on the Android build worker '
                f'(STORE_APP_MOCK_BUILD=false).\n'
            ),
        )
        manifest = work / 'app' / 'src' / 'main' / 'AndroidManifest.xml'
        if manifest.exists():
            zf.write(manifest, 'AndroidManifest.xml')
    return apk_path


def _run_gradle(work: Path) -> Path:
    gradlew = work / ('gradlew.bat' if os.name == 'nt' else 'gradlew')
    wrapper_jar = work / 'gradle' / 'wrapper' / 'gradle-wrapper.jar'
    if not gradlew.exists():
        raise RuntimeError(f'Gradle wrapper missing in template: {gradlew}')
    if not wrapper_jar.is_file():
        raise RuntimeError(
            'gradle-wrapper.jar missing from Android template. '
            'Restore backend/store_app/android_template/gradle/wrapper/gradle-wrapper.jar'
        )
    if os.name != 'nt':
        gradlew.chmod(gradlew.stat().st_mode | 0o111)
    cmd = [str(gradlew), 'assembleDebug', '--no-daemon']
    env = os.environ.copy()
    result = subprocess.run(
        cmd,
        cwd=str(work),
        env=env,
        capture_output=True,
        text=True,
        timeout=getattr(settings, 'STORE_APP_BUILD_TIMEOUT', 900),
    )
    if result.returncode != 0:
        logger.error('Gradle failed: %s\n%s', result.stdout[-2000:], result.stderr[-4000:])
        raise RuntimeError(result.stderr[-2000:] or result.stdout[-2000:] or 'Gradle build failed')
    apk_dir = work / 'app' / 'build' / 'outputs' / 'apk' / 'debug'
    apks = list(apk_dir.glob('*.apk'))
    if not apks:
        raise RuntimeError('APK output not found after Gradle build')
    return apks[0]


def process_build(build_id: int) -> None:
    from store_app.models import StoreAppBuild

    try:
        build = StoreAppBuild.objects.select_related('store').get(pk=build_id)
    except StoreAppBuild.DoesNotExist:
        return

    if build.status in (StoreAppBuild.Status.COMPLETED, StoreAppBuild.Status.CANCELLED):
        return
    if build.status == StoreAppBuild.Status.BUILDING:
        return

    build.status = StoreAppBuild.Status.BUILDING
    build.started_at = timezone.now()
    build.error_message = ''
    build.technical_error = ''
    build.save(update_fields=['status', 'started_at', 'error_message', 'technical_error'])

    work_root = Path(tempfile.mkdtemp(prefix=f'store_app_{build_id}_'))
    try:
        template = _template_dir()
        if not template.exists():
            raise RuntimeError(f'Android template missing: {template}')

        work = work_root / 'project'
        shutil.copytree(template, work, ignore=shutil.ignore_patterns('.gradle', 'build', 'local.properties'))
        _write_placeholders(work, build)
        _relocate_java_sources(work, build.package_name)
        _write_local_properties(work)

        use_mock = _mock_enabled()
        if use_mock:
            apk_path = _make_mock_apk(work, build)
        else:
            apk_path = _run_gradle(work)

        filename = f'store{build.store_id}-v{build.version_code}.apk'
        with open(apk_path, 'rb') as fh:
            build.apk_file.save(filename, ContentFile(fh.read()), save=False)
        from store_app.services import ensure_apk_dir_protected
        ensure_apk_dir_protected()

        build.status = StoreAppBuild.Status.COMPLETED
        build.completed_at = timezone.now()
        if use_mock:
            build.technical_error = 'MOCK_APK_NOT_INSTALLABLE'
        else:
            build.technical_error = ''
        build.save(update_fields=['apk_file', 'status', 'completed_at', 'technical_error'])
        logger.info('Build %s completed for store %s', build_id, build.store_id)
    except Exception as exc:  # noqa: BLE001 — capture all build failures
        logger.exception('Build %s failed', build_id)
        build.status = StoreAppBuild.Status.FAILED
        build.completed_at = timezone.now()
        build.technical_error = str(exc)[:4000]
        build.error_message = 'تعذر إنشاء التطبيق. حاول مرة أخرى لاحقاً أو تواصل مع الدعم.'
        build.save(update_fields=['status', 'completed_at', 'technical_error', 'error_message'])
    finally:
        shutil.rmtree(work_root, ignore_errors=True)


def enqueue_build(build_id: int) -> None:
    """Fire-and-forget background processing without Celery."""
    inline = bool(getattr(settings, 'STORE_APP_BUILD_INLINE', True))
    if not inline:
        return

    import threading

    def _run():
        from django.db import connection

        connection.close()
        process_build(build_id)

    thread = threading.Thread(target=_run, name=f'store-app-build-{build_id}', daemon=True)
    thread.start()

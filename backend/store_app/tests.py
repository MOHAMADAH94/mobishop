"""Tests for Store Android App Generator — isolated feature."""

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from catalog.models import StoreCatalogProfile
from store_app.builder import process_build
from store_app.models import StoreAppBuild
from store_app.services import package_name_for_store, resolve_store_url
from stores.models import Role, Store, StoreMembership
from users.models import User

# 1x1 PNG
PNG_BYTES = bytes.fromhex(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489'
    '0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082'
)


def _make_store(username, store_name, slug, *, app_enabled=True, catalog_enabled=True):
    user = User.objects.create_user(username=username, password='pass12345')
    store = Store.objects.create(
        name=store_name,
        owner=user,
        catalog_enabled=catalog_enabled,
        store_app_enabled=app_enabled,
    )
    owner_role, _ = Role.objects.get_or_create(code=Role.Code.OWNER, defaults={'name': 'مالك'})
    StoreMembership.objects.get_or_create(
        store=store, user=user, defaults={'role': owner_role, 'is_active': True},
    )
    StoreCatalogProfile.objects.update_or_create(
        store=store,
        defaults={'slug': slug, 'is_public': True},
    )
    return user, store


@override_settings(
    STORE_APP_MOCK_BUILD=True,
    STORE_APP_BUILD_INLINE=False,
    STORE_APP_PUBLIC_BASE_URL='https://mobishop.online',
)
class StoreAppApiTests(TestCase):
    def setUp(self):
        self.user_a, self.store_a = _make_store('owner_a', 'Ahmed Mobile', 'ahmad-mobile')
        self.user_b, self.store_b = _make_store('owner_b', 'Basel Shop', 'basel-shop')
        self.client = APIClient()

    def _auth(self, user, store):
        self.client.force_authenticate(user=user)
        self.client.credentials(HTTP_X_STORE_ID=str(store.id))

    def test_resolve_url_from_slug(self):
        self.assertEqual(
            resolve_store_url(self.store_a),
            'https://mobishop.online/shop/ahmad-mobile?app=1',
        )
        self.assertEqual(package_name_for_store(self.store_a), f'com.mobishop.store.s{self.store_a.id}')

    def test_feature_disabled(self):
        self.store_a.store_app_enabled = False
        self.store_a.save(update_fields=['store_app_enabled'])
        self._auth(self.user_a, self.store_a)
        r = self.client.get('/api/store-app/status/')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data['can_generate'])
        self.assertIn('غير متاحة', r.data['message'])

    def test_generate_uses_own_store_url(self):
        self._auth(self.user_a, self.store_a)
        r = self.client.post(
            '/api/store-app/builds/',
            {'app_name': 'Ahmed Mobile', 'primary_color': '#112233'},
            format='multipart',
        )
        self.assertEqual(r.status_code, 201, r.data)
        build = StoreAppBuild.objects.get(pk=r.data['id'])
        self.assertEqual(build.store_id, self.store_a.id)
        self.assertEqual(build.store_url, 'https://mobishop.online/shop/ahmad-mobile?app=1')
        process_build(build.pk)
        build.refresh_from_db()
        self.assertEqual(build.status, StoreAppBuild.Status.COMPLETED)
        self.assertTrue(build.apk_file)

    def test_store_a_cannot_download_store_b(self):
        build = StoreAppBuild.objects.create(
            store=self.store_b,
            requested_by=self.user_b,
            app_name='Basel',
            store_url=resolve_store_url(self.store_b),
            package_name=package_name_for_store(self.store_b),
            version_name='1.0.0',
            version_code=1,
            status=StoreAppBuild.Status.COMPLETED,
        )
        process_build(build.pk)  # noop if already completed — force file
        build.status = StoreAppBuild.Status.PENDING
        build.save(update_fields=['status'])
        process_build(build.pk)
        build.refresh_from_db()

        self._auth(self.user_a, self.store_a)
        r = self.client.get(f'/api/store-app/builds/{build.pk}/download/')
        self.assertEqual(r.status_code, 404)

    def test_cannot_inject_other_store_url(self):
        self._auth(self.user_a, self.store_a)
        r = self.client.post(
            '/api/store-app/builds/',
            {
                'app_name': 'Hack',
                'store_url': 'https://mobishop.online/shop/basel-shop',
                'store_id': self.store_b.id,
            },
            format='multipart',
        )
        self.assertEqual(r.status_code, 400)

    def test_invalid_icon_rejected(self):
        self._auth(self.user_a, self.store_a)
        bad = SimpleUploadedFile('evil.exe', b'MZ123', content_type='application/octet-stream')
        r = self.client.post(
            '/api/store-app/builds/',
            {'app_name': 'Ahmed', 'app_icon': bad},
            format='multipart',
        )
        self.assertEqual(r.status_code, 400)

    def test_large_icon_rejected(self):
        self._auth(self.user_a, self.store_a)
        huge = SimpleUploadedFile(
            'big.png',
            PNG_BYTES + (b'0' * (2 * 1024 * 1024 + 10)),
            content_type='image/png',
        )
        r = self.client.post(
            '/api/store-app/builds/',
            {'app_name': 'Ahmed', 'app_icon': huge},
            format='multipart',
        )
        self.assertEqual(r.status_code, 400)

    def test_version_increments(self):
        self._auth(self.user_a, self.store_a)
        r1 = self.client.post('/api/store-app/builds/', {'app_name': 'A'}, format='multipart')
        self.assertEqual(r1.status_code, 201)
        process_build(r1.data['id'])
        r2 = self.client.post('/api/store-app/builds/', {'app_name': 'A2'}, format='multipart')
        self.assertEqual(r2.status_code, 201)
        self.assertEqual(r2.data['version_code'], 2)
        self.assertEqual(r2.data['version_name'], '1.0.1')

    def test_status_after_build(self):
        self._auth(self.user_a, self.store_a)
        r = self.client.post('/api/store-app/builds/', {'app_name': 'Ahmed Mobile'}, format='multipart')
        self.assertEqual(r.status_code, 201)
        process_build(r.data['id'])
        status = self.client.get('/api/store-app/status/')
        self.assertEqual(status.status_code, 200, status.content)
        self.assertIsNotNone(status.data['latest_build'])
        self.assertEqual(status.data['latest_build']['status'], 'completed')

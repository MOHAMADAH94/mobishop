"""تقارير الارتباطات في لوحة Django Admin (مستخدمون ↔ متاجر ↔ موظفون)."""

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404, render
from django.urls import path

from stores.models import Employee, Store, StoreMembership

User = get_user_model()


def _overview_stats():
    return {
        'users_total': User.objects.count(),
        'users_staff': User.objects.filter(is_staff=True).count(),
        'users_active': User.objects.filter(is_active=True).count(),
        'stores_total': Store.objects.count(),
        'stores_active': Store.objects.filter(is_active=True).count(),
        'memberships_active': StoreMembership.objects.filter(is_active=True).count(),
        'employees_total': Employee.objects.count(),
        'owners_with_multi_stores': (
            User.objects.annotate(n=Count('owned_stores'))
            .filter(n__gt=1)
            .count()
        ),
    }


def _user_detail(user):
    owned = (
        Store.objects.filter(owner=user)
        .annotate(
            members_count=Count('memberships', filter=Q(memberships__is_active=True), distinct=True),
            employees_count=Count('employees', distinct=True),
        )
        .order_by('name')
    )
    memberships = (
        StoreMembership.objects.filter(user=user)
        .select_related('store', 'role', 'store__owner')
        .annotate(
            store_members=Count('store__memberships', filter=Q(store__memberships__is_active=True), distinct=True),
            store_employees=Count('store__employees', distinct=True),
        )
        .order_by('store__name')
    )
    employments = (
        Employee.objects.filter(user=user)
        .select_related('store', 'membership__role')
        .order_by('store__name')
    )
    return {
        'user': user,
        'owned_stores': list(owned),
        'owned_count': owned.count(),
        'memberships': list(memberships),
        'memberships_count': memberships.count(),
        'employments': list(employments),
        'employments_count': employments.count(),
    }


def _store_detail(store):
    members = (
        StoreMembership.objects.filter(store=store)
        .select_related('user', 'role')
        .order_by('role__code', 'user__username')
    )
    employees = (
        Employee.objects.filter(store=store)
        .select_related('user', 'membership__role')
        .order_by('user__username')
    )
    branches_same_owner = list(
        Store.objects.filter(owner=store.owner).exclude(pk=store.pk).order_by('name')
    )
    members_list = list(members)
    employees_list = list(employees)
    return {
        'store': store,
        'members': members_list,
        'members_count': sum(1 for m in members_list if m.is_active),
        'members_total': len(members_list),
        'employees': employees_list,
        'employees_count': len(employees_list),
        'branches_same_owner': branches_same_owner,
        'branches_count': len(branches_same_owner) + 1,
    }


def platform_reports_view(request):
    user_id = request.GET.get('user') or ''
    store_id = request.GET.get('store') or ''

    users = User.objects.order_by('username').only(
        'id', 'username', 'email', 'first_name', 'last_name', 'is_active', 'is_staff',
    )
    stores = (
        Store.objects.select_related('owner')
        .annotate(
            members_count=Count('memberships', filter=Q(memberships__is_active=True), distinct=True),
            employees_count=Count('employees', distinct=True),
        )
        .order_by('name')
    )

    selected_user = None
    user_report = None
    if user_id.isdigit():
        selected_user = get_object_or_404(User, pk=int(user_id))
        user_report = _user_detail(selected_user)

    selected_store = None
    store_report = None
    if store_id.isdigit():
        selected_store = get_object_or_404(Store.objects.select_related('owner'), pk=int(store_id))
        store_report = _store_detail(selected_store)

    stores_summary = list(stores[:200])

    users_without_store = (
        User.objects.filter(is_active=True)
        .annotate(
            owned_n=Count('owned_stores', distinct=True),
            mem_n=Count('store_memberships', filter=Q(store_memberships__is_active=True), distinct=True),
        )
        .filter(owned_n=0, mem_n=0)
        .order_by('username')[:100]
    )

    context = {
        **admin.site.each_context(request),
        'title': 'تقارير الارتباطات',
        'stats': _overview_stats(),
        'users': users,
        'stores': stores,
        'selected_user_id': str(selected_user.pk) if selected_user else '',
        'selected_store_id': str(selected_store.pk) if selected_store else '',
        'user_report': user_report,
        'store_report': store_report,
        'stores_summary': stores_summary,
        'users_without_store': users_without_store,
    }
    return render(request, 'admin/platform_reports.html', context)


def register_admin_reports():
    """ربط مسار التقارير بلوحة الأدمن مرة واحدة."""
    if getattr(admin.site, '_mobishop_reports_registered', False):
        return

    _original_get_urls = admin.site.get_urls

    def get_urls():
        custom = [
            path(
                'platform-reports/',
                admin.site.admin_view(platform_reports_view),
                name='platform_reports',
            ),
        ]
        return custom + _original_get_urls()

    admin.site.get_urls = get_urls
    admin.site._mobishop_reports_registered = True

from django.contrib import admin

from expenses.models import Expense


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ('title', 'amount', 'category', 'expense_date', 'store', 'is_active')
    list_filter = ('category', 'payment_method', 'is_active', 'store')
    search_fields = ('title', 'notes')

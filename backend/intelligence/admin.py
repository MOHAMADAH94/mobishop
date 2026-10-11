from django.contrib import admin

from intelligence.models import BusinessRecommendation, RecommendationRunLog


@admin.register(BusinessRecommendation)
class BusinessRecommendationAdmin(admin.ModelAdmin):
    list_display = ('title', 'store', 'severity', 'kind', 'category', 'is_active', 'generated_at')
    list_filter = ('severity', 'kind', 'category', 'is_active', 'is_dismissed')
    search_fields = ('title', 'entity_name')


@admin.register(RecommendationRunLog)
class RecommendationRunLogAdmin(admin.ModelAdmin):
    list_display = ('store', 'last_run_at', 'recommendations_count')

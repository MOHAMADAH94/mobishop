from rest_framework import serializers

from intelligence.models import BusinessRecommendation


class BusinessRecommendationSerializer(serializers.ModelSerializer):
    severity_display = serializers.CharField(source='get_severity_display', read_only=True)
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = BusinessRecommendation
        fields = [
            'id',
            'severity',
            'severity_display',
            'kind',
            'kind_display',
            'category',
            'category_display',
            'title',
            'reason',
            'suggested_action',
            'entity_type',
            'entity_id',
            'entity_name',
            'is_dismissed',
            'generated_at',
        ]
        read_only_fields = fields


class DecisionCenterSummarySerializer(serializers.Serializer):
    total_active = serializers.IntegerField()
    critical_count = serializers.IntegerField()
    opportunities_count = serializers.IntegerField()
    warning_count = serializers.IntegerField()
    info_count = serializers.IntegerField()
    last_generated_at = serializers.DateTimeField(allow_null=True)

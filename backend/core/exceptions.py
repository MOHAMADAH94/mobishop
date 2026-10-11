from django.conf import settings
from django.db import IntegrityError
from rest_framework import status
from rest_framework.exceptions import Throttled
from rest_framework.response import Response
from rest_framework.views import exception_handler


def custom_exception_handler(exc, context):
    if isinstance(exc, IntegrityError):
        return Response(
            {'detail': 'هذا السجل موجود مسبقاً. جرّب اسماً مختلفاً.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if isinstance(exc, Throttled):
        wait = int(exc.wait or 0)
        detail = 'محاولات كثيرة. أعد المحاولة بعد قليل.'
        if wait > 0:
            detail = f'محاولات كثيرة. أعد المحاولة بعد {wait} ثانية.'
        return Response({'detail': detail}, status=status.HTTP_429_TOO_MANY_REQUESTS)
    response = exception_handler(exc, context)
    if response is None and not settings.DEBUG:
        return Response(
            {'detail': 'خطأ داخلي في الخادم. راجع سجل الأخطاء أو تواصل مع الدعم.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    return response
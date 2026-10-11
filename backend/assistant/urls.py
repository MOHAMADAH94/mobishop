from django.urls import path

from assistant.views import (
    ChatSessionDetailView,
    ChatSessionListView,
    ChatView,
    SuggestedQuestionsView,
    SupportRequestCreateView,
)

urlpatterns = [
    path('suggested-questions/', SuggestedQuestionsView.as_view(), name='assistant-suggested'),
    path('sessions/', ChatSessionListView.as_view(), name='assistant-sessions'),
    path('sessions/<int:pk>/', ChatSessionDetailView.as_view(), name='assistant-session-detail'),
    path('chat/', ChatView.as_view(), name='assistant-chat'),
    path('support-requests/', SupportRequestCreateView.as_view(), name='assistant-support'),
]

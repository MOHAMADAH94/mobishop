from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class AuthLoginThrottle(AnonRateThrottle):
    scope = 'auth_login'


class AuthRegisterThrottle(AnonRateThrottle):
    scope = 'auth_register'


class AssistantChatThrottle(UserRateThrottle):
    """Limit AI/assistant chat cost per authenticated user."""

    scope = 'assistant_chat'


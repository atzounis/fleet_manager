from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import IsAuthenticated


class DashboardAuthMixin:
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

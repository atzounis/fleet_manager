from django.http import JsonResponse

from fleet.services.devices import AgentAuthError, authenticate_agent_request


def require_agent_device(request) -> tuple[object | None, JsonResponse | None]:
    try:
        return authenticate_agent_request(request), None
    except AgentAuthError as exc:
        return None, JsonResponse({"error": exc.message}, status=exc.status)

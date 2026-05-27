from celery import shared_task
from django.db import DatabaseError, OperationalError

from fleet.models import CrashReport
from fleet.services.events import sync_connectivity_events
from fleet.services.heartbeats import flush_heartbeats_to_db
from fleet.services.symbolication import symbolicate_crash


@shared_task
def flush_heartbeat_stream() -> int:
    try:
        count = flush_heartbeats_to_db()
        sync_connectivity_events()
        return count
    except (DatabaseError, OperationalError):
        raise


@shared_task(bind=True, max_retries=2)
def symbolicate_crash_report(self, crash_report_id: int) -> None:
    try:
        report = CrashReport.objects.select_related("device").get(pk=crash_report_id)
    except CrashReport.DoesNotExist:
        return

    report.status = CrashReport.Status.SYMBOLICATING
    report.save(update_fields=["status"])

    try:
        trace = symbolicate_crash(report.dump_s3_key, report.elf_s3_key)
        report.symbolicated_trace = trace
        report.status = CrashReport.Status.COMPLETE
        report.error_message = ""
    except Exception as exc:
        report.status = CrashReport.Status.FAILED
        report.error_message = str(exc)
    report.save(update_fields=["symbolicated_trace", "status", "error_message"])

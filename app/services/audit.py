from ..models import AuditLog


def audit(db, user_id, action: str, entity: str, entity_id: int | None = None,
          detail: dict | None = None) -> None:
    """Catat siapa melakukan apa. Dipanggil di dalam sesi tulis yang sama."""
    db.add(AuditLog(user_id=user_id, action=action, entity=entity,
                    entity_id=entity_id, detail=detail))

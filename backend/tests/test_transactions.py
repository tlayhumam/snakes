from sqlalchemy.exc import OperationalError

from app.transactions import is_retryable_deadlock


class MysqlError(Exception):
    pass


def test_mysql_deadlock_and_lock_timeout_are_retryable():
    assert is_retryable_deadlock(OperationalError("sql", {}, MysqlError(1213, "deadlock")))
    assert is_retryable_deadlock(OperationalError("sql", {}, MysqlError(1205, "timeout")))


def test_other_operational_errors_are_not_retried():
    assert not is_retryable_deadlock(OperationalError("sql", {}, MysqlError(2006, "gone away")))

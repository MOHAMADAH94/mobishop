from datetime import date, datetime, time, timedelta

from django.utils import timezone


def local_day_bounds(day: date) -> tuple[datetime, datetime]:
    """Inclusive start, exclusive end — avoids MySQL CONVERT_TZ on shared hosting."""
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(day, time.min), tz)
    return start, start + timedelta(days=1)


def local_month_start(day: date) -> datetime:
    return local_day_bounds(day.replace(day=1))[0]


def local_month_end_exclusive(day: date) -> datetime:
    """First moment of the month after *day*'s month."""
    if day.month == 12:
        next_first = day.replace(year=day.year + 1, month=1, day=1)
    else:
        next_first = day.replace(month=day.month + 1, day=1)
    return local_day_bounds(next_first)[0]


def parse_dashboard_day(value: str | None, default: date) -> date:
    if not value:
        return default
    return date.fromisoformat(value)


def parse_dashboard_month(value: str | None, fallback_day: date) -> date:
    """Return the first day of the selected month (YYYY-MM)."""
    if not value:
        return fallback_day.replace(day=1)
    parts = value.strip().split('-')
    if len(parts) != 2:
        raise ValueError('صيغة الشهر غير صالحة. استخدم YYYY-MM.')
    year, month = int(parts[0]), int(parts[1])
    return date(year, month, 1)


def month_period_bounds(month_first: date, today: date) -> tuple[datetime, datetime]:
    """Inclusive month start, exclusive end — capped at today for the current month."""
    start = local_month_start(month_first)
    end_exclusive = local_month_end_exclusive(month_first)
    if month_first.year == today.year and month_first.month == today.month:
        _, today_end = local_day_bounds(today)
        if today_end < end_exclusive:
            end_exclusive = today_end
    return start, end_exclusive

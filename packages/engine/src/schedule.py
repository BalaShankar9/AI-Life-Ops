"""Deterministic schedule helpers for time-aware planning."""

from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Any, Dict, List, Tuple
from zoneinfo import ZoneInfo

from life_systems import COMPLIANCE_CATEGORY, RECOVERY_CATEGORY

ADJACENCY_MINUTES = 5
SPLITTABLE_CATEGORIES = {COMPLIANCE_CATEGORY, RECOVERY_CATEGORY, "admin"}


def normalize_busy_blocks(busy_blocks: List[Dict[str, Any]], tz: str) -> List[Tuple[datetime, datetime]]:
    """Normalize, sort, and merge busy blocks in the target timezone."""
    zone = ZoneInfo(tz)
    intervals: List[Tuple[datetime, datetime]] = []

    for block in busy_blocks:
        if not isinstance(block, dict):
            continue
        start_raw = block.get("start_ts")
        end_raw = block.get("end_ts")
        if not isinstance(start_raw, str) or not isinstance(end_raw, str):
            continue
        start = _parse_iso_datetime(start_raw)
        end = _parse_iso_datetime(end_raw)
        if not start or not end:
            continue
        start = _ensure_tz(start, zone)
        end = _ensure_tz(end, zone)
        if end <= start:
            continue
        intervals.append((start, end))

    if not intervals:
        return []

    intervals.sort(key=lambda item: item[0])
    merged: List[List[datetime]] = []
    for start, end in intervals:
        if not merged:
            merged.append([start, end])
            continue
        last_start, last_end = merged[-1]
        if start <= last_end + timedelta(minutes=ADJACENCY_MINUTES):
            if end > last_end:
                merged[-1][1] = end
        else:
            merged.append([start, end])

    return [(start, end) for start, end in merged]


def derive_day_bounds(
    profile_context: Dict[str, Any], tz: str, day_date: datetime
) -> Tuple[datetime, datetime]:
    """Return the day start/end bounds based on wake/sleep windows."""
    zone = ZoneInfo(tz)
    wake_time = _parse_time(profile_context["wake_window_start"])
    sleep_time = _parse_time(profile_context["sleep_window_end"])

    start = datetime.combine(day_date.date(), wake_time, tzinfo=zone)
    end = datetime.combine(day_date.date(), sleep_time, tzinfo=zone)
    if end <= start:
        end += timedelta(days=1)

    return start, end


def compute_free_windows(
    day_bounds: Tuple[datetime, datetime],
    merged_busy: List[Tuple[datetime, datetime]],
) -> List[Tuple[datetime, datetime]]:
    """Return free windows within day bounds after removing busy blocks."""
    day_start, day_end = day_bounds
    if day_end <= day_start:
        return []

    free: List[Tuple[datetime, datetime]] = []
    cursor = day_start

    for busy_start, busy_end in merged_busy:
        if busy_end <= day_start or busy_start >= day_end:
            continue
        start = max(busy_start, day_start)
        end = min(busy_end, day_end)
        if start > cursor:
            free.append((cursor, start))
        if end > cursor:
            cursor = end

    if cursor < day_end:
        free.append((cursor, day_end))

    return free


def pick_windows_for_actions(
    actions: List[Dict[str, Any]],
    free_windows: List[Tuple[datetime, datetime]],
) -> Tuple[List[Dict[str, Any]], List[str], Dict[str, int]]:
    """Assign actions into free windows and return schedule plan and conflicts."""
    windows = [[start, end] for start, end in free_windows]
    schedule_plan: List[Dict[str, Any]] = []
    conflicts: List[str] = []
    assigned_durations: Dict[str, int] = {}

    for action in actions:
        duration = int(action["time_estimate_min"])
        split_allowed = action.get("split_allowed", False)
        blocks = _assign_action_to_windows(action, duration, windows, split_allowed)
        if not blocks:
            conflicts.append(_conflict_message(action, duration, split_allowed))
            continue

        total_duration = 0
        for index, (start, end) in enumerate(blocks, start=1):
            block_duration = int(round((end - start).total_seconds() / 60))
            total_duration += block_duration
            schedule_plan.append(
                {
                    "title": action["title"],
                    "start_ts": start.isoformat(),
                    "end_ts": end.isoformat(),
                    "duration_min": block_duration,
                    "category": action["category"],
                    "why_this_time": _why_this_time(action, index, len(blocks)),
                }
            )
        assigned_durations[action["title"]] = total_duration

    return schedule_plan, conflicts, assigned_durations


def free_time_summary(free_windows: List[Tuple[datetime, datetime]]) -> Dict[str, int]:
    total = 0
    largest = 0
    for start, end in free_windows:
        minutes = int(round((end - start).total_seconds() / 60))
        if minutes > 0:
            total += minutes
            largest = max(largest, minutes)
    return {
        "total_free_min": total,
        "largest_window_min": largest,
        "windows_count": len(free_windows),
    }


def infer_schedule_date(busy_blocks: List[Dict[str, Any]], tz: str) -> datetime:
    zone = ZoneInfo(tz)
    for block in busy_blocks:
        if not isinstance(block, dict):
            continue
        start_raw = block.get("start_ts")
        if isinstance(start_raw, str):
            start = _parse_iso_datetime(start_raw)
            if start:
                return _ensure_tz(start, zone)
    return datetime.now(zone)


def _assign_action_to_windows(
    action: Dict[str, Any],
    duration: int,
    windows: List[List[datetime]],
    split_allowed: bool,
) -> List[Tuple[datetime, datetime]] | None:
    for index, (start, end) in enumerate(windows):
        if _minutes_between(start, end) >= duration:
            block_end = start + timedelta(minutes=duration)
            _consume_window(windows, index, block_end)
            return [(start, block_end)]

    if not split_allowed:
        return None

    for index, (start, end) in enumerate(windows):
        window_minutes = _minutes_between(start, end)
        if window_minutes <= 0:
            continue
        first_len = min(duration, window_minutes)
        remaining = duration - first_len
        if remaining <= 0:
            block_end = start + timedelta(minutes=first_len)
            _consume_window(windows, index, block_end)
            return [(start, block_end)]

        for next_index in range(index + 1, len(windows)):
            next_start, next_end = windows[next_index]
            if _minutes_between(next_start, next_end) >= remaining:
                first_end = start + timedelta(minutes=first_len)
                removed = _consume_window(windows, index, first_end)
                if removed and next_index > index:
                    next_index -= 1
                second_end = next_start + timedelta(minutes=remaining)
                _consume_window(windows, next_index, second_end)
                return [(start, first_end), (next_start, second_end)]

    return None


def _consume_window(
    windows: List[List[datetime]], index: int, new_start: datetime
) -> bool:
    _, end = windows[index]
    if new_start >= end:
        windows.pop(index)
        return True
    windows[index][0] = new_start
    return False


def _minutes_between(start: datetime, end: datetime) -> int:
    return int(round((end - start).total_seconds() / 60))


def _why_this_time(action: Dict[str, Any], part_index: int, total_parts: int) -> str:
    notes: List[str] = []
    if action.get("compressed"):
        notes.append(
            f"Compressed from {action['original_time_estimate_min']} to {action['time_estimate_min']} min to fit available windows."
        )
    if total_parts > 1:
        notes.append(f"Split into {total_parts} blocks to fit around busy windows.")
        notes.append(f"Block {part_index} uses the earliest available gap.")
    else:
        notes.append("Chosen as the earliest available gap after busy blocks.")
    return " ".join(notes)


def _conflict_message(action: Dict[str, Any], duration: int, split_allowed: bool) -> str:
    if split_allowed:
        return f"No two windows available to fit {duration} min for {action['title']}."
    return f"No {duration}-min window available for {action['title']}."


def _parse_iso_datetime(value: str) -> datetime | None:
    try:
        cleaned = value.replace("Z", "+00:00")
        return datetime.fromisoformat(cleaned)
    except ValueError:
        return None


def _parse_time(value: str) -> time:
    hour, minute = value.split(":")
    return time(int(hour), int(minute))


def _ensure_tz(value: datetime, zone: ZoneInfo) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=ZoneInfo("UTC")).astimezone(zone)
    return value.astimezone(zone)

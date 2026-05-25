#!/usr/bin/env python3
"""
Generate ICS file for NCKU 114學年度 academic calendar (2025-08 ~ 2026-07).

Source: Official NCKU PDFs
  - https://web.ncku.edu.tw/var/file/0/1000/img/4970/252878992.pdf (114-1)
  - https://web.ncku.edu.tw/var/file/0/1000/img/4970/864385213.pdf (114-2)

Output:
  - assets/_variants/e118-academic-2025-2026.ics
  - assets/_variants/e118-academic-2025-2026-events.md  (review list)
"""

from pathlib import Path
from datetime import date, timedelta
import hashlib

OUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "_variants"
OUT_DIR.mkdir(parents=True, exist_ok=True)


# Event tuple: (start_date, end_date_inclusive or None, emoji, title, description, category)
# end_date=None means single-day all-day event
# end_date=date means multi-day range (inclusive)

EVENTS = [
    # ── 114-1 學期里程碑 ─────────────────────────────────────────
    (date(2025, 9, 8), None, "🎓", "114-1 學期開始（開始上課）",
     "成大114學年度第1學期正式上課第一天", "學期里程碑"),
    (date(2026, 1, 5), date(2026, 1, 9), "📝", "114-1 期末考週",
     "彈性課程銜接跨域學習依課程大綱公告之評量日期辦理", "考試"),
    (date(2026, 1, 23), None, "📊", "114-1 教師繳交學期成績截止",
     "教師繳交學期成績截止日 — GPA 確定", "課業"),
    (date(2026, 1, 31), None, "🎓", "114-1 學期結束",
     "成大114學年度第1學期最後一天", "學期里程碑"),

    # ── 114-2 學期里程碑 ─────────────────────────────────────────
    (date(2026, 2, 1), None, "🎓", "114-2 學期開始",
     "成大114學年度第2學期開始（行政上）", "學期里程碑"),
    (date(2026, 2, 23), None, "🎓", "114-2 開始上課",
     "成大114學年度第2學期正式上課第一天", "學期里程碑"),
    (date(2026, 5, 22), None, "📚", "114-2 退選截止",
     "學士班及研究所(含專班)退選截止", "選課"),
    (date(2026, 6, 6), None, "🎓", "成大畢業典禮",
     "114學年度畢業典禮", "學期里程碑"),
    (date(2026, 6, 22), date(2026, 6, 26), "📝", "114-2 期末考週",
     "彈性課程銜接跨域學習依課程大綱公告之評量日期辦理", "考試"),
    (date(2026, 7, 10), None, "📊", "114-2 教師繳交學期成績截止",
     "教師繳交學期成績截止日 — GPA 確定", "課業"),
    (date(2026, 7, 31), None, "🎓", "114-2 學期結束",
     "成大114學年度第2學期最後一天", "學期里程碑"),

    # ── 國定假日 ─────────────────────────────────────────────────
    (date(2025, 9, 28), None, "🎉", "教師節（放假）",
     "孔子誕辰紀念日／教師節", "國定假日"),
    (date(2025, 9, 29), None, "🎉", "教師節補假",
     "孔子誕辰紀念日／教師節補假", "國定假日"),
    (date(2025, 10, 6), None, "🎉", "中秋節（放假）",
     "", "國定假日"),
    (date(2025, 10, 10), None, "🎉", "國慶日（放假）",
     "雙十國慶", "國定假日"),
    (date(2025, 10, 24), None, "🎉", "臺灣光復節補假",
     "臺灣光復暨金門古寧頭大捷紀念日（補假）", "國定假日"),
    (date(2025, 10, 25), None, "🎉", "臺灣光復節（放假）",
     "臺灣光復暨金門古寧頭大捷紀念日", "國定假日"),
    (date(2025, 11, 11), None, "🎂", "成大校慶（停課）",
     "國立成功大學校慶日，全校停課", "學期里程碑"),
    (date(2025, 12, 25), None, "🎉", "行憲紀念日（放假）",
     "", "國定假日"),
    (date(2026, 1, 1), None, "🎉", "開國紀念日（放假）",
     "中華民國開國紀念日", "國定假日"),
    (date(2026, 2, 16), None, "🎉", "除夕（放假）",
     "農曆春節除夕", "國定假日"),
    (date(2026, 2, 17), date(2026, 2, 20), "🎉", "春節（初一至初四放假）",
     "農曆新年連假", "國定假日"),
    (date(2026, 2, 27), None, "🎉", "和平紀念日補假",
     "228 和平紀念日補假", "國定假日"),
    (date(2026, 2, 28), None, "🎉", "和平紀念日（放假）",
     "228 和平紀念日", "國定假日"),
    (date(2026, 4, 3), None, "🎉", "兒童節補假",
     "", "國定假日"),
    (date(2026, 4, 4), None, "🎉", "兒童節（放假）",
     "", "國定假日"),
    (date(2026, 4, 5), None, "🎉", "民族掃墓節（放假）",
     "清明節", "國定假日"),
    (date(2026, 4, 6), None, "🎉", "民族掃墓節補假",
     "清明節補假", "國定假日"),
    (date(2026, 4, 7), date(2026, 4, 8), "🏫", "校際活動日（停課）",
     "校際活動日停課，授課教師自行補課", "學期里程碑"),
    (date(2026, 5, 1), None, "🎉", "勞動節（放假）",
     "", "國定假日"),
    (date(2026, 6, 19), None, "🎉", "端午節（放假）",
     "", "國定假日"),

    # ── 114-1 選課/繳費 ─────────────────────────────────────────
    (date(2025, 8, 20), date(2025, 8, 26), "📚", "114-1 第二階段網路選課",
     "暫訂", "選課"),
    (date(2025, 8, 22), date(2025, 9, 8), "💰", "114-1 第一學期繳交學雜費期間",
     "", "繳費"),
    (date(2025, 9, 5), date(2025, 9, 6), "📚", "114-1 第三階段第1次網路選課",
     "暫訂", "選課"),
    (date(2025, 9, 8), date(2025, 9, 10), "📚", "114-1 限定身分系辦選課",
     "依選課公告", "選課"),
    (date(2025, 9, 10), date(2025, 9, 16), "📚", "114-1 線上加簽申請",
     "暫訂", "選課"),
    (date(2025, 9, 12), None, "📚", "114-1 學分抵免申請截止",
     "", "選課"),
    (date(2025, 9, 18), date(2025, 9, 22), "📚", "114-1 網路選課確認期",
     "暫訂", "選課"),
    (date(2025, 10, 13), None, "📊", "114-1 課業輔導開始",
     "暫訂", "課業"),
    (date(2025, 12, 5), None, "📚", "114-1 學士班及研究所退選截止",
     "", "選課"),
    (date(2026, 1, 13), date(2026, 1, 16), "📚", "114-2 第一階段網路選課",
     "暫訂 — 為下學期選課", "選課"),

    # ── 114-2 選課/繳費 ─────────────────────────────────────────
    (date(2026, 2, 2), date(2026, 2, 6), "📚", "114-2 第二階段網路選課",
     "暫訂", "選課"),
    (date(2026, 2, 6), date(2026, 2, 23), "💰", "114-2 第二學期繳交學雜費期間",
     "", "繳費"),
    (date(2026, 2, 11), date(2026, 2, 12), "📚", "114-2 第三階段第1次網路選課",
     "暫訂", "選課"),
    (date(2026, 2, 23), date(2026, 2, 24), "📚", "114-2 限定身分系辦選課",
     "依選課公告", "選課"),
    (date(2026, 2, 25), date(2026, 3, 3), "📚", "114-2 線上加簽申請",
     "暫訂", "選課"),
    (date(2026, 3, 2), None, "📚", "114-2 學分抵免申請截止",
     "", "選課"),
    (date(2026, 3, 5), date(2026, 3, 9), "📚", "114-2 網路選課確認期",
     "暫訂", "選課"),
    (date(2026, 3, 26), date(2026, 4, 14), "💰", "114-2 第二階段學分費繳費",
     "", "繳費"),
    (date(2026, 3, 30), None, "📊", "114-2 課業輔導開始",
     "暫訂", "課業"),
    (date(2026, 5, 25), date(2026, 6, 18), "📊", "114-2 教學意見反應調查",
     "", "課業"),
    (date(2026, 6, 18), None, "📚", "114-2 第2學期休學申請截止",
     "", "選課"),
    (date(2026, 7, 13), date(2026, 7, 17), "📚", "115-1 第一階段網路選課",
     "暫訂 — 為下學年第1學期選課", "選課"),

    # ── EMBA 特有（從官網抓到） ──────────────────────────────────
    (date(2026, 5, 20), date(2026, 6, 10), "☀️", "EMBA 114-2 暑期班報名期間",
     "台北暑期班第30期 報名期間", "EMBA 暑期"),
    (date(2026, 7, 4), None, "☀️", "EMBA 暑期班開課",
     "台北暑期班第30期 開課日 — 每週末 10:00-17:00", "EMBA 暑期"),
    (date(2026, 9, 6), None, "☀️", "EMBA 暑期班結束",
     "台北暑期班第30期 結束日", "EMBA 暑期"),
]


def fmt_date(d):
    return d.strftime("%Y%m%d")


def make_uid(d, title):
    h = hashlib.md5(f"{d}{title}".encode()).hexdigest()[:12]
    return f"e118-academic-{h}@e118.aqualux.dev"


def build_ics():
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//E118//NCKU EMBA Academic Calendar 2025-2026//ZH-TW",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:E118 成大校曆 (114學年度)",
        "X-WR-TIMEZONE:Asia/Taipei",
        "X-WR-CALDESC:NCKU 114學年度行事曆 (2025-08 ~ 2026-07) for E118 班務參考",
    ]

    for ev in EVENTS:
        start, end, emoji, title, desc, category = ev
        summary = f"{emoji} {title}"
        # All-day event: DTEND is exclusive (next day) per RFC 5545
        if end is None:
            dtend = start + timedelta(days=1)
        else:
            dtend = end + timedelta(days=1)
        lines += [
            "BEGIN:VEVENT",
            f"UID:{make_uid(start, title)}",
            f"DTSTAMP:{fmt_date(date(2026, 5, 25))}T000000Z",
            f"DTSTART;VALUE=DATE:{fmt_date(start)}",
            f"DTEND;VALUE=DATE:{fmt_date(dtend)}",
            f"SUMMARY:{summary}",
            f"DESCRIPTION:{desc}",
            f"CATEGORIES:{category}",
            "TRANSP:TRANSPARENT",  # all-day, doesn't block calendar
            "END:VEVENT",
        ]

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def build_review_md():
    """Markdown summary for review before import."""
    from collections import defaultdict
    by_cat = defaultdict(list)
    for ev in EVENTS:
        start, end, emoji, title, desc, category = ev
        date_str = start.strftime("%Y/%m/%d")
        if end:
            date_str += " – " + end.strftime("%m/%d")
        by_cat[category].append((start, date_str, emoji, title, desc))

    lines = ["# E118 成大 114學年度行事曆 (2025-08 ~ 2026-07)",
             "",
             f"共 {len(EVENTS)} 個事件 · 來源：成大官方 PDF",
             ""]
    cat_order = ["學期里程碑", "考試", "國定假日", "選課", "繳費",
                 "課業", "EMBA 暑期"]
    for cat in cat_order:
        if cat not in by_cat:
            continue
        events = sorted(by_cat[cat])
        lines.append(f"## {cat} ({len(events)})")
        lines.append("")
        for start, ds, emoji, title, desc in events:
            line = f"- **{ds}** · {emoji} {title}"
            if desc:
                line += f" — {desc}"
            lines.append(line)
        lines.append("")
    return "\n".join(lines)


def main():
    ics = build_ics()
    md = build_review_md()

    ics_out = OUT_DIR / "e118-academic-2025-2026.ics"
    md_out = OUT_DIR / "e118-academic-2025-2026-events.md"

    ics_out.write_text(ics)
    md_out.write_text(md)

    print(f"  wrote {ics_out.relative_to(OUT_DIR.parent.parent)}  ({len(EVENTS)} events)")
    print(f"  wrote {md_out.relative_to(OUT_DIR.parent.parent)}")


if __name__ == "__main__":
    main()

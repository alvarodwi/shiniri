import names
from shiniri_cli.sheets import SheetsError

DB = [["nameCode", "name"], ["5118", "Asuka"], ["5069", "Rei"], ["5119", "Rei"], ["5001", "Anis"],
      ["5002", "Crown"]]


def test_unknown_part_with_cell_and_closest():
    tabs = {"Molds": [["date", "moldtype", "amount", "ssr", "result"],
                      ["2023-06-30", "Yellow Mold", "5", "2", "Anis, Crwn\nAsuka"],
                      ["2023-07-01", "Purple Mold", "3", "0", ""],
                      ["2023-07-02", "Purple Mold", "3", "0"]]}  # ragged: trailing blank dropped
    lines = names.sweep(DB, tabs)
    assert lines[0] == "Molds!E2  Crwn  (closest: Crown)"
    assert lines[-1] == "1 unknown names in 1 cells"


def test_no_closest_when_nothing_is_near():
    lines = names.sweep(DB, {"SpareBody": [["Date", "Target"], ["", ""], ["2023-03-09", "Zzzzzz"]]})
    assert lines[0] == "SpareBody!B3  Zzzzzz"


def test_event_row_order_then_column_order():
    tabs = {"Event": [["Date", "Rate-Up Name", "Rate-Up Type", "Resources Used", "", "Times", "Total \nSSR",
                       "SSR Details"],
                      ["", "", "", "Gems", "Tix"],
                      ["2023-06-30", "Asuka Shikinami Langley", "Collab", "", "10", "10", "2",
                       "Asuka Shikinami Langley, Eve"]]}
    lines = names.sweep(DB, tabs)
    assert [l.split("  ")[0] for l in lines[:3]] == ["Event!B3", "Event!H3", "Event!H3"]
    assert lines[-1] == "3 unknown names in 2 cells"


def test_missing_header_goes_on():
    tabs = {"Event": [["Date", "rateUpName", "SSR Details"], ["2023-06-30", "Nope", "Eve"]],
            "Other": [["Date", "SSR Details"], ["2022-11-08", "Anis"]]}
    lines = names.sweep(DB, tabs)
    assert lines[0] == 'Event: no column "Rate-Up Name"'
    assert lines[1].startswith("Event!C2  Eve")
    assert lines[-1] == "1 unknown names in 1 cells"


def test_duplicate_database_names():
    lines = names.sweep(DB, {})
    assert lines == ["NikkeDatabase: duplicate name Rei (5069, 5119)", "0 unknown names in 0 cells"]


class FakeApi:
    def __init__(self, values):
        self.values = values
        self.ranges = []

    def get_values(self, range_, unformatted=False):
        self.ranges.append(range_)
        v = self.values.get(range_)
        if v is None:
            raise SheetsError("Sheets API 400: Unable to parse range")
        return v


def test_report_reads_every_tab_and_keeps_going():
    api = FakeApi({"'NikkeDatabase'": DB, "'Social'": [["Date", "Times", "Total SSR", "SSR Details"],
                                                       ["2023-06-17", "1", "1", "Asuk"]]})
    lines = names.report(api)
    assert api.ranges == ["'NikkeDatabase'", "'Social'", "'Event'", "'Ordinary'", "'Molds'", "'SpareBody'",
                          "'Other'"]
    assert "Social!D2  Asuk  (closest: Asuka)" in lines
    assert "Event: Sheets API 400: Unable to parse range" in lines
    assert lines[-1] == "1 unknown names in 1 cells"


def test_report_stops_when_database_unreadable():
    assert names.report(FakeApi({})) == ["NikkeDatabase: Sheets API 400: Unable to parse range"]


def test_closest_falls_back_to_leading_name():
    lines = names.sweep(DB, {"SpareBody": [["Date", "Target"], ["2023-03-09", "Asuka Shikinami Langley"],
                                           ["2023-03-10", "Rei Ayanami (Tentative Name)"]]})
    assert lines[:2] == ["SpareBody!B2  Asuka Shikinami Langley  (closest: Asuka)",
                         "SpareBody!B3  Rei Ayanami (Tentative Name)  (closest: Rei)"]

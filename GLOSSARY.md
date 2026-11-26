# shiniri

NIKKE progress logged into Google Sheets, plus a stats page that turns the logged data into one-line facts.

## Campaign

**Story stage**:
A campaign stage that must be cleared to progress.
_Avoid_: Main stage

**Side stage**:
A SUB or EX stage, which does not block progress.

**Jumped chapter**:
A Normal chapter where some story stages were passed over without being cleared.

**Skipped stage**:
A story stage passed over in a jumped chapter.

## Tower

**Tribe tower**:
The tower that is open every day, with no limit on clears.

**Manufacturer tower**:
The Elysion, Missilis, Tetra or Pilgrim tower. It allows three clears on each of its open days and none otherwise.

**Open day**:
A game day on which a manufacturer tower accepts clears. Elysion opens Tuesday, Friday and Sunday; Missilis Wednesday, Saturday and Sunday; Tetra Monday, Thursday and Sunday; Pilgrim Wednesday and Sunday.

**Boss floor**:
Every tenth floor of a tower, which is always a boss fight.

## Solo Raid

**Season**:
One Solo Raid event, against one boss.

**Rank**:
The viewer's final standing in a season, as a top percentage or, near the top, a placement. Lower is better, and any placement counts as top 0%.

**Weakness**:
The element the season's boss is weak to.
_Avoid_: Element

**Frame**:
The reward for a season, decided by rank: tier 3 for top 3% or better, tier 2 for top 10% or better, tier 1 otherwise. Not playing a season gives none.

## Furnace

**Furnace attempt**:
One use of Manufacturer Arms Furnace, which consumes two sacrifices and gives one gear piece.

**Target**:
The manufacturer the viewer chooses before a furnace attempt. The result always has it.

**Sacrifice**:
A gear piece consumed by a furnace attempt.

## Gacha

**Limited NIKKE**:
A NIKKE obtainable from the gacha only during particular banners. A **collaboration limited** one is Abnormal (every Abnormal NIKKE is limited); a **seasonal limited** one is any other limited NIKKE.

**Overspec NIKKE**:
Any Pilgrim NIKKE, or one of the few from another manufacturer that the game ranks with them, such as `Rapi: Red Hood` or `Anis: Star`.

**Release date**:
The day a NIKKE or costume first became obtainable: the start of its own banner, event or Liberation batch. This can be later than the date of the patch note that announces it. A rerun never changes it.
_Avoid_: Update date, patch date

**Free NIKKE**:
A NIKKE given out by an event instead of recruited on a banner, such as `Kilo` or `Rapunzel: Sanctuary`.

**Liberation NIKKE**:
A NIKKE obtained through Liberation missions rather than recruitment. They arrive in batches: `Guilty`, `Sin` and `Quency` first, then `Nihilister`.

## Stats

**Fact**:
One statistic the app can state, defined in code: its question, its filters, the tabs it reads and how it computes. A fact belongs to a single spreadsheet and may read several of its tabs.
_Avoid_: Stored formula, stat, metric

**Title**:
The short heading of a fact, with no filters in it. The picker lists titles and a card shows its title as the heading.
_Avoid_: Teaser, label, headline

**Question**:
The sentence template of a fact, with a slot for each filter. A card shows it with the chosen filters filled in.
_Avoid_: Prompt

**Filter**:
A value the viewer picks to narrow a fact, such as a boss or a range preset. Each fact declares its own options, which may include "any". A filter has no default.
_Avoid_: Arg, argument, parameter

**Range preset**:
A named date range resolved against the game day, such as "last week" or "this month".
_Avoid_: Relative date, date shortcut

**Answer**:
The value computed for one fact under one set of filters. It is one finding, which may carry its count or date, never a list or a chart. Zero is a value; a fact with nothing to say gives no answer.
_Avoid_: Result, output

**Card**:
What the viewer sees: one fact's question with its filters filled in and its answer.
_Avoid_: Tile, widget, panel

**Category**:
A group of facts about one subject the viewer can choose from before choosing a fact, such as Pulls or Gear. A fact has exactly one category, which follows what the fact counts, not the tab it reads. Counting runs, including runs that dropped gear, is Interception; Gear is about the pieces themselves.
_Avoid_: Section, topic

**Pick sheet**:
The bottom sheet where the viewer builds a card: first a category, then a fact, then each filter not yet chosen. Every step also offers Random.
_Avoid_: Picker, modal, drawer

**Roll**:
Choosing a fact and every one of its filters at random, from all categories, then showing the card. A roll never repeats on a zero or an empty answer.
_Avoid_: Random fact, re-roll

**Shuffle**:
The button that rolls a new card.

## Progress

**Level jump**:
Two or more synchro level milestones reached on the same game day. A milestone is every fifth level.

**Snapshot**:
The account's state recorded once per game day, normally after the daily missions are done. If they never are, it is recorded just before the day ends.
_Avoid_: Profile row, daily row

## Interception

**Anomaly Interception**:
The current interception mode. The viewer logs each of its runs on its own.

**Special Interception**:
The earlier interception mode, replaced by Anomaly Interception. Its history is closed and is logged per game day, with bosses on a fixed five-day rotation.

**Run**:
One interception attempt against one boss, in either mode.
_Avoid_: Attempt, battle

**Module drop**:
A run that gave at least one module. Its size is the number of modules that run gave, which in Special Interception is always one.
_Avoid_: Module day

**T9 gear**:
A generic tier 9 piece of equipment, dropped only in Special Interception.

**Manufacturer gear**:
A tier 9 piece of equipment tied to a manufacturer, dropped in either mode.

**Gear piece**:
One piece of equipment, however the viewer got it.
_Avoid_: Item, drop

**Box**:
A source of gear pieces outside interception, which the viewer opens. Its result is random, locked to one manufacturer, or chosen by the viewer.
_Avoid_: Run, pull

**Gear drop**:
A run that gave equipment. In Anomaly Interception it is manufacturer gear from a boss other than Kraken; in Special Interception it is T9 gear or manufacturer gear.
_Avoid_: Equipment day

**Unguaranteed run**:
An Anomaly Interception run against a boss other than Kraken below stage 9, which may or may not give manufacturer gear.

**Empty run**:
A Special Interception run that gave nothing tracked.

**Double reward day**:
A game day with twice the usual number of runs.
_Avoid_: Bonus day

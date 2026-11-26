# shiniri

NIKKE progress logged into Google Sheets, plus a stats page that turns the logged data into one-line facts.

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
A group of facts about one subject the viewer can choose from before choosing a fact, such as Pulls or Gear. A fact has exactly one category, which follows what the fact counts, not the tab it reads.
_Avoid_: Section, topic

**Pick sheet**:
The bottom sheet where the viewer builds a card: first a category, then a fact, then each filter not yet chosen. Every step also offers Random.
_Avoid_: Picker, modal, drawer

**Roll**:
Choosing a fact and every one of its filters at random, from all categories, then showing the card. A roll never repeats on a zero or an empty answer.
_Avoid_: Random fact, re-roll

**Shuffle**:
The button that rolls a new card.

## Anomaly Interception

**Run**:
One Anomaly Interception attempt against one boss.
_Avoid_: Attempt, battle

**Module drop**:
A run that gave at least one module. Its size is the number of modules that run gave.
_Avoid_: Module day

**Gear drop**:
A run against a boss other than Kraken that gave equipment.
_Avoid_: Equipment day

**Double reward day**:
A game day with twice the usual number of runs.
_Avoid_: Bonus day

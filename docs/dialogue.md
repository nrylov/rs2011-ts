# NPC conversations

Browser and headless clients use the same dialogue service. Standard NPC/player speech, statement boxes, choices, hidden components, and tutorial instructions are decoded from revision 634 interface metadata and live server text. The general ClientScript VM and arbitrary scripted interfaces remain outside this coverage.

## Lightweight client

Click **Talk** beside a nearby NPC, or select its **Talk-to** map action. Conversation text stays in a panel at the bottom of the viewport, including on mobile. Continue and choice buttons wait for the game to update before enabling another click. Space/Enter continue speech; number keys choose the displayed response index. Shortcuts leave text inputs and focused buttons alone. Space never selects a response from a choice menu.

## Scripted conversations

```ts
const first = await bot.talkTo('Guardsman Peale'); // NPC must be in the current tracking range
console.log(first.speaker, first.lines);

// Continue speech until a choice appears. No choice is selected automatically.
const checkpoint = await bot.navigateDialog();
console.log(checkpoint.dialog?.options.map(o => ({index: o.index, text: o.text})));

// Choose by the actual displayed text, then observe the replacement dialogue.
await bot.chooseDialogOption('Tell me about Lumbridge.', {
  expected: checkpoint.dialog!,
});

// Read subsequent speech, then choose Bye when the next menu is reached.
const result = await bot.navigateDialog(['Bye.']);
console.log(result.ended, result.steps);
```

A string matches the complete label, ignoring case; use a regular expression for partial matching. An ambiguous match fails and lists the available options. The `expected` snapshot prevents a late click from selecting an option on a replacement dialogue. Numeric choices use the **one-based published `index`**, which is separate from its wire component ID. Query the current options rather than assuming their order.

High-level methods:

| Method | Result |
| --- | --- |
| `bot.talkTo(npcOrName, timeout?)` | Finds a currently tracked NPC's Talk-to action and waits for a new dialogue. Name can be a string/regex; target can be a live entity. |
| `bot.continueDialog({expected?, timeout?}?)` | Continues a speech/message panel; rejects a panel requiring a choice. Returns the next dialogue or `null` after closure. |
| `bot.chooseDialogOption(textOrRegexOrIndex, {expected?, timeout?}?)` | Selects a published response and observes progress. |
| `bot.navigateDialog(choices?, {timeout?, maxSteps?}?)` | Continues speech and consumes explicit choices in sequence. Stops at the next unanswered choice and reports `awaitingChoice`. Defaults: 30 seconds, 30 steps. |

`navigateDialog` returns `{dialog, steps, choicesSelected, ended, awaitingChoice}`. It throws if a requested choice is missing/ambiguous, the conversation ends before all requested choices, the step/time limit is reached, or the connection fails. It never guesses a branch or interprets a response containing “continue” as a speech continuation.

## Low-level queries and dispatches

```ts
const dialog = await sdk.getDialog(); // null when no supported dialogue is mounted
// id, parent, token, kind, speaker?, title?, lines, text,
// buttons, options, continueButton

const next = await sdk.waitForDialog({after: dialog, timeout: 10_000});
await sdk.clickDialogByText(/^Yes\b/i, next); // dispatch only; no progress acknowledgement
// Or: await sdk.sendClickDialog(next.options[0].index, next);
```

`kind` is `continue`, `choice`, `text` (no player action), or `instruction`. `text` retains the original array including speaker/title for compatibility; `lines` holds the body. `waitForDialog` ignores tutorial instruction panels by default; set `includeInstructions: true` to include them. It accepts an `AbortSignal` for cancellation.

Observed helpers recognize same-interface text changes and remounts, and ignore unrelated interface updates. They allow a short close/open gap while waiting for a replacement panel. `null`/`ended` describes an observed closed conversation panel after a 900 ms settling window; it does not prove completion of a quest or other game effect. Scripts expecting a deliberately delayed new conversation can call `waitForDialog` again. High-level actions reject overlapping control on the same `BotActions` instance.

Run [examples/npc-dialogue.ts](../examples/npc-dialogue.ts) with a dedicated character near the selected NPC:

```sh
VOID_USERNAME=mytest VOID_PASSWORD=localpassword \
VOID_NPC='Guardsman Peale' bun run example:dialogue
```

Set `VOID_DIALOG_CHOICE` to select one exact displayed response after the initial speech. Without it, the example prints choices and leaves them unanswered.

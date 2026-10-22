# Reliable actions and readable state

These APIs work in the local SDK and through the gateway/MCP. Refresh both the gateway and client SDK before using newly added methods; a running publisher keeps its previously loaded code. Reload MCP after updating its tool definitions. The changes do not require a game-server restart. Existing game actions already accepted by the server may finish.

## Cancel a pending action

```ts
const pending = sdk.castSpellOnNpc('Air Strike', chicken, 20000);
// From another control request, or while retaining pending locally:
await sdk.cancelAction();
await pending.catch(error => console.log(error.message));
```

The gateway aborts hosted mutations when their command deadline expires, their controller disconnects, or `cancelAction()` is called. Pending observations and dialogue waits unsubscribe; cooperative walking stops scheduling further legs. A packet already accepted by the game is not undone. There is no stop-combat or undo-attack packet in this cancellation API.

The action lock remains held until its implementation unwinds. An outstanding cache read or other non-cooperative preparation may need to return first, but its cancelled scope prevents a late game packet. The gateway never releases ownership just to allow overlapping actions. Observers cannot cancel a controller's action. Standalone high-level bot actions and confirmed combat setters also own cancellation scopes.

Named casting now recognizes fresh `I can't reach` refusals. A cast consuming runes or awarding Magic XP remains its observed-success criterion; autocast selection is a separate operation. Gateway deadlines honor explicit cast, walk and banking timeouts plus response margin.

## Banking and item actions

```ts
await bot.depositItem(590, 7);             // numeric ID, arbitrary positive amount
await bot.depositItem('Logs', 'all');     // every matching item, including a stack
await bot.depositAll();                   // all carried item IDs
await bot.withdrawItem(590, 5);           // ID, not a slot
await bot.withdrawItem(/^tinderbox$/i, 1);
const bankItem = await sdk.findBankItem(590);
await bot.withdrawItem(bankItem, 1);      // explicit objects still validate their slot

const definition = await sdk.itemDefinition(2309);
const inventory = await sdk.getInventoryDetails();
await sdk.useInventoryItem(2309, 'Eat');   // numeric selectors are item IDs here
const ground = await sdk.getGroundItemDetails();
const object = await sdk.objectDefinition(3045);
```

Bank amounts accept positive integers up to 2147483647 or `'all'`. Arbitrary amounts use the real Deposit-X/Withdraw-X prompt and confirm the observed inventory/bank transfer. Notes deposited into the bank are checked against their unnoted ID. Withdrawal requires item mode; note-mode withdrawal is rejected explicitly. Explicit item objects remain useful for stale-slot protection; ambiguous name patterns reject instead of choosing a different item type.

`useInventoryItem` confirms dispatch only; observe HP, inventory, XP or messages to confirm its effect. Named actions preserve their original cache menu slots. The existing synchronous local `getGroundItems()` remains available to map/UI consumers; the awaited details query adds names and floor options. Empty names in the actual cache stay empty rather than being guessed.

## Reachability

```ts
const approach = await sdk.canReach(npc); // also accepts an object, tile, or NPC name
console.log(approach.reachable, approach.blockingDoor, approach.reason);
```

`reachable` means a walking approach exists with the current collision. A closed door can produce `reachable: false`, `reachableAfterOpeningDoors: true` and the actual `blockingDoor`/`requiredDoors`. The query moves nothing. `planNpcInteraction` and `planRoute` remain available for detailed paths.

This is walking geometry, not spell line of sight or a guarantee of permission. Doors can still be quest-locked; winches, cutscenes, cages, floors and special transit may require explicit game actions. Unknown terrain remains blocked. Object approaches are checked against the local collision map and do not authorize interaction through a wall.

## Quests

```ts
const offer = await sdk.getQuestOffer();
if (offer?.hiddenFields.items) await sdk.revealQuestOffer('items');
if (offer?.hiddenFields.rewards) await sdk.revealQuestOffer('rewards');
await sdk.acceptQuest(); // or declineQuest()

const quest = await sdk.getQuestState("Cook's Assistant");
const points = await sdk.getQuestPoints();
const known = await sdk.getQuestDefinitions();
const states = await sdk.getQuests();
await sdk.openQuestJournal("Cook's Assistant");
const journal = await sdk.getQuestJournal();
```

Offers and generic dialogues respect component ancestors' visibility. Hidden items/rewards return `null`; explicit reveal clicks the game's own controls. A missing title can be recovered only when the start-point text uniquely identifies a known quest, and `titleSource` reports that fallback. It remains `null` when identity is uncertain. `getQuestOffer()` is now awaited even locally.

The generated profiles use this project's Void quest variable definitions, not revision-225 IDs. The catalogue is definition coverage, not a claim that every listed quest is implemented. Quest state distinguishes `unknown`, `unstarted`, `started` and `completed`; an unsynchronized variable does not silently mean unstarted. Varbit reads honor newer direct versus parent updates. Journals show the currently received, visible scroll lines; opening one is a game action and may replace the current modal. Unsupported journal indices fail explicitly.

The base server has a separate quest-offer metadata fix: its loader stores `name` and `questPoints` as dedicated fields, so the offer must read those rather than generic extra parameters. That source fix needs a rebuilt game server; SDK fallback supports existing running servers without a restart.

## Coordinates, messages and compact state

```ts
const summary = await sdk.getStateSummary();
const sourceTile = await sdk.toSourceCoords();             // current player
const otherSourceTile = await sdk.toSourceCoords({x:6501, y:1048, level:1});
const fullLayout = await sdk.getRegionLayout();
const messages = await sdk.getMessages({afterSequence: previousSequence});
```

Source-coordinate conversion reverses the instance chunk's rotation and plane. Normal world tiles are unchanged; unmapped instance holes return `null`. **Send movement and interaction actions in destination/game coordinates**, never converted source coordinates. Source coordinates are for inspection and comparison with world maps.

`getStateSummary()` replaces the region's full chunk table with counts and includes the player's source tile. Raw `getState()` and the gateway snapshot retain their original layout metadata for consumers that need it. Message packets now carry local receipt time (`receivedAt`, epoch milliseconds), received client tick (`tick`) and monotonic session `sequence`. These are receipt metadata, not a claim to know the server's original send time. `getMessages` supports `afterSequence`, `sinceTick` and `sinceTime`; legacy manually inserted messages can have unknown time/age.

## Auto Retaliate

```ts
const retaliation = await sdk.getAutoRetaliateState();
await sdk.setAutoRetaliate(true);
await sdk.setAutoRetaliate(false);
```

The setter selects Combat Styles, clicks revision-634 component 884:15 only when necessary, and waits for varp 172 (0 = enabled, 1 = disabled). Unknown synchronization remains `enabled: null`. Hidden/locked controls and fresh refusals reject. Repeating the current setting is safe. These operations are also in the lightweight/regular development-console examples; no game-server patch is required.

## Individual item stats and comparisons

```ts
const sword = await sdk.getItemStats(1277);          // Bronze sword
const comparison = await sdk.compareItems(1279, 1277); // Iron minus Bronze
console.log(sword.bonuses, sword.attackSpeedTicks, sword.requirements);
console.log(comparison.bonusDelta, comparison.attackSpeedTicksDelta);
```

These are read-only cache queries and work through the gateway/MCP, including observer connections. They do not equip anything or open a game interface. Both methods accept numeric item IDs or objects with an `id`, so inventory, bank and ground item objects can be passed directly.

`getItemStats` returns named attack/defence bonuses, melee/ranged/magic strength, prayer, magic damage and damage absorption percentages, base attack speed, weapon style/options and explicit equip-level requirements. Strength parameters are divided by ten to match revision-634 display units; percentage fields remain percentages. Missing bonus parameters on equipment default to zero as in the cache's equipment view. Missing attack speed remains null. The seconds field is the nominal interval at 600 ms per game tick, before attack-style or spell-specific changes.

Notes and lent items resolve to their underlying item's stats while retaining the requested ID and `noted`/`lent` flags. `equipment` describes the resolved base item, not proof that the requested noted/lent ID can be equipped. Non-equipment returns `bonuses: null`. The requirements list includes only requirements explicitly encoded in the cache; absence is not proof that no server restriction exists.

Comparison deltas are **candidate minus reference**. Positive attack/strength/defence bonuses are increases; a negative attack-speed delta means the candidate's base attack interval is shorter. The helper provides no universal winner or DPS prediction: accuracy against the target, style, speed, requirements, ammunition, spell choice, special attacks and set effects can change the useful choice.

Every result identifies its source as `revision-634-cache` and sets `serverOverridesIncluded: false`. Custom server item overrides, special effects, and live player-wide totals are not inferred from the cache. For the equipped character's authoritative displayed totals, use `openEquipmentStats()`/`getEquipmentStats()` instead.

## Shops (revision 634)

Use the same API locally, through the gateway, or in MCP `execute_code`:

```ts
await bot.openShop(/^shopkeeper$/i); // optional NPC, exact name, or RegExp
console.log(await sdk.getShopState()); // title, currency balance, paid stock, samples
const item = await sdk.findShopItem('Tinderbox');
if (item && item.amount > 0) {
  console.log(await sdk.inspectShopItem(item)); // opens the game's item-info side panel
  console.log(await bot.buyFromShop(item, 7));
}
// Free stock is explicit: inspect getShopItems({sample:true}) before taking it.
// await bot.takeShopSample('Bronze hatchet', 1);
// await bot.sellToShop('Logs', 'all');
await bot.closeShop();
```

Queries: `getShopState()`, `getShopItems({sample?:boolean})`,
`findShopItem(id|exactName|RegExp|ShopItem,{sample?:boolean})`, and
`getShopItemInfo()` are available to observers. Prices come from the server's
item-info varcs, not cache item values. `getShopItemInfo()` returns null unless
that panel is open. `inspectShopItem(item,{sample?:boolean,timeout?:number})`
is a control action; it opens the panel and waits for the quote. Negative raw
prices are retained, with `unitPrice:null`; explicit free-sample inspection
returns `unitPrice:0`. Quotes can change with shop stock.

`openShop(target?,timeout=20000)` walks to a nearby NPC with a Trade/Shop option
and waits for fresh full stock. Custom shops reached through dialogue require
using the dialogue API first. `closeShop(timeout=5000)` closes the shop and
its side panels. `bot.closeInterface()` also handles shops. Normal inventory
use/equip/drop actions require closing the shop first.

`buyFromShop(item,amount=1,timeout=20000)`,
`sellToShop(item,amount=1,timeout=20000)`, and
`takeShopSample(item,amount=1,timeout=20000)` accept a positive integer or
`'all'`. Numeric items mean definition IDs; objects validate their current slot
and shop identity. Nonstandard quantities use supported buttons in sequential
batches. Each batch waits for inventory changes plus stock or currency evidence.
Results contain `requested`, observed `amount`, `complete`, `reason`, and
`currency:{id,name,change}` (signed observed balance change). Stock, budget, or
inventory limits can produce partial results; inspect them before continuing.
`'all'` means the available quantity at the start, not future restocks. These
observations cannot distinguish simultaneous manual trades or unrelated item
changes; keep one controller and avoid overlapping manual inventory actions.
Timeout/cancellation stops later batches; it cannot retract a packet already
accepted by the server. Re-query inventory before retrying uncertain trades.

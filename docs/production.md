# Skill production

The lightweight client and SDK share a production-menu decoder. Starting the ordinary game interaction opens the menu: use a bar on an anvil, ore on a furnace, a knife on logs, a needle on leather, or a mould/bar on a furnace. Object menus also expose actions such as Spin, Fire, Craft-rune and Infuse-pouch. Requirements and results remain subject to game rules.

The **Production** panel appears when a production interface opens. Filter by product name, select a quantity, and make the product. The panel closes when the game closes its menu. Make X opens an amount form; the same form appears for other server number requests. Disabled products include explicit missing-mould messages and Summoning level/ingredient requirements. A visible smithing recipe can still fail a level, quest or material check; fresh refusals are displayed in the action status/dialogue.

## SDK

```ts
const bar = await sdk.findInventoryItem('Bronze bar');
const anvil = await sdk.findNearbyObject(/^anvil$/i);
if (!bar || !anvil) throw new Error('Bronze bar and nearby anvil required');
await bot.useItemOnObject(bar, anvil); // reports effect: 'creation' for smithing
const menu = await sdk.getCreationMenu();
console.log(menu?.products.map(p => ({name:p.name, quantities:p.actions.map(a => a.amount)})));
await bot.create('Bronze dagger', 1, 20_000, menu ?? undefined);
```

Use `await bot.create(product, amount)` after opening any supported production menu. Product selectors accept an exact case-insensitive name or a RegExp that matches exactly one product. Amounts accept positive integers, `'all'`, or `'x'`; supported amounts depend on the current interface. Arbitrary numeric amounts use Make X where offered. The shared 905 recipe interface currently exposes 1, 5, 10 and All. A quantity is a number of crafting operations; products such as arrow shafts can yield multiple items per operation.

`bot.create` waits for the first observed inventory conversion, a requested numeric input (`effect: 'input'`) or a new production menu (`effect: 'menu'`). It does **not** promise the full requested batch completed, nor that the result was successful food rather than burnt food. Inspect inventory/XP and wait for the expected final counts before starting another action. A timeout does not cancel a game action already dispatched.

`getCreationMenu()` returns a current snapshot with a token, title, named products, available quantity actions, visible requirements and menu controls. `sdk.selectCreationProduct(product, amount, expectedMenu?)` is dispatch-only. Pass the snapshot to reject stale choices; the selector always re-reads current products before dispatch. Component IDs, option slots, item IDs and dynamic child slots remain wire identities. `sdk.selectCreationControl('Transform Scrolls', menu)` switches a supported menu tab.

For manual amount entry:

```ts
await sdk.selectCreationProduct('Bronze dagger', 'x');
// Wait for getNumberInput() to report the new prompt.
const input = sdk.getNumberInput();
if (input) sdk.submitNumber(3, input.sequence);
```

For an automatic custom amount, use `await bot.create('Bronze dagger', 3)`. It waits for a fresh amount prompt before replying. Unknown, missing and stale input prompts are rejected. `await bot.closeInterface()` also closes supported production menus.

## Interface coverage

| Interface family | Skills/workflows |
| --- | --- |
| Shared recipe dialogue 905 / quantity 916 | Cooking; furnace smelting; fletching; leather/glass/gem crafting; spinning/weaving/pottery; herblore and other server recipes using `makeAmount` |
| Smithing 300 | Bar-on-anvil equipment production, named displayed items, Make 1 / 5 / All / X |
| Jewellery 446 / 675 and silver moulds 438 | Gold/gem jewellery and silver casting, hidden products/mould requirements |
| Tanning 324 | Soft/hard leather, snakeskins and dragonhide quantity actions |
| Bolt enchanting 432 / teleport tablets 400 | Dedicated enchanting and tablet menus |
| Construction 396 / 397 / 402 | Furniture container items, flatpack categories and room menu actions |
| Summoning 666 / 672 | Cache enum products, dynamic child slots, pouch/scroll tabs, level/ingredient checks |

This is interface and action support, not an autonomous trainer for every skill or a complete recipe database. Menu-free activities use the existing inventory, item-on-item, item-on-object and object/NPC APIs. Instanced map decoding is supported; specialized house-building interfaces and actions still need their own coverage. Individual quest-specific interfaces outside these families may need another profile. Construction and other specialized interfaces are not all covered by end-to-end gameplay tests.

Live validation covers Tutorial Island smithing Make 1 and Make X, bronze smelting, arrow shafts, leather gloves, gold rings, silver casting, Summoning pouch infusion and scroll transformation. Summoning validation used an isolated test-only opener to display the normal production menu and then exercised the real server handlers; that opener is not part of the deployed client or server. Unit tests cover hidden/stale menu protection, option slots, prompts, Summoning metadata, furniture item slots and gateway access rules. Profiles come from the revision 634 Void interface definitions; regenerate with `bun scripts/generate-creation-profiles.ts /path/to/void` after a server revision/content update. They intentionally do not copy rs-sdk's 2004 IDs.

All public production queries/actions and `bot.create` are exposed through the authenticated gateway. Await **every** remote method, including `getNumberInput()` and `submitNumber()`.

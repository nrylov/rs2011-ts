package content.sdk

import world.gregs.voidps.engine.Script
import world.gregs.voidps.engine.entity.character.player.skill.Skill
import world.gregs.voidps.engine.inv.sendInventory

/** Publish authoritative login state even while Tutorial Island hides sidebar tabs. */
class LoginStateSync : Script {
    init {
        playerSpawn {
            sendInventory("inventory")
            sendInventory("worn_equipment")
            Skill.entries.forEach { experience.update(it) }
        }
    }
}

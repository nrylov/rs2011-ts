package content.skill.firemaking

import WorldTest
import containsMessage
import itemOnItem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test
import world.gregs.voidps.engine.entity.character.player.skill.Skill
import world.gregs.voidps.engine.entity.obj.GameObjects
import world.gregs.voidps.engine.entity.obj.ObjectLayer
import world.gregs.voidps.engine.inv.add
import world.gregs.voidps.engine.inv.inventory
import world.gregs.voidps.type.Tile

class FiremakingPlacementTest : WorldTest() {
    @Test
    fun `Nonblocking tutorial path detail permits firemaking`() {
        val tile = Tile(3103, 3096)
        val decoration = GameObjects.getLayer(tile, ObjectLayer.GROUND_DECORATION)
        assertNotNull(decoration)
        assertFalse(decoration!!.def.interactive == 1 && decoration.def.solid == 1)
        val player = createPlayer(tile)
        player.levels.set(Skill.Firemaking, 100)
        player.inventory.add("tinderbox")
        player.inventory.add("logs")
        player.itemOnItem(0, 1)
        tick(12)
        assertFalse(player.containsMessage("You can't light a fire here."))
        assertEquals(0, player.inventory.count("logs"))
        assertTrue(player.experience.get(Skill.Firemaking) > 0)
    }

    @Test
    fun `An existing fire still blocks another fire on its tile`() {
        val tile = Tile(3104, 3094)
        createObject("fire_orange", tile)
        val player = createPlayer(tile)
        player.inventory.add("tinderbox")
        player.inventory.add("logs")
        player.itemOnItem(0, 1)
        tick(6)
        assertTrue(player.containsMessage("You can't light a fire here."))
        assertEquals(1, player.inventory.count("logs"))
    }
}

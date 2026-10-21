// Adapted for GregHib/Void (BSD-3-Clause). See THIRD_PARTY.md for notices.
package world.gregs.voidps.engine.client

import world.gregs.voidps.engine.Script
import org.koin.java.KoinJavaComponent.getKoin
import world.gregs.voidps.engine.data.definition.QuestDefinitions
import world.gregs.voidps.engine.entity.character.Character
import world.gregs.voidps.engine.entity.character.player.Player
import world.gregs.voidps.engine.entity.character.player.chat.ChatType

/** Observe game feedback after its normal chat packet has been sent. */
object GameMessageFeedback : AutoCloseable {
    private val handlers = mutableListOf<(Player, String, ChatType) -> Unit>()
    init { Script.interfaces.add(this) }
    fun listen(handler: (Player, String, ChatType) -> Unit) {
        Script.checkLoading()
        handlers.add(handler)
    }
    @JvmStatic
    fun normalize(text: String, type: ChatType): String {
        if (type != ChatType.Game || !text.startsWith("Congratulations, you've completed a quest: ")) return text
        return QuestCompletionMessages.format(text) { title ->
            runCatching { getKoin().get<QuestDefinitions>().definitions.firstOrNull { it.name?.equals(title, ignoreCase = true) == true }?.name }.getOrNull()
        }
    }
    @JvmStatic
    fun emit(player: Character, text: String, type: ChatType) {
        if (player !is Player) return
        for (handler in handlers) handler(player, text, type)
    }
    override fun close() { handlers.clear() }
}

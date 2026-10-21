package compat.validation

import world.gregs.voidps.engine.client.GameMessageFeedback
import world.gregs.voidps.engine.client.QuestCompletionMessages
import world.gregs.voidps.engine.entity.character.player.chat.ChatType
fun main() {
 val prefix="Congratulations, you've completed a quest: "
 val cases=mapOf("<navy>cook's assistant" to "<navy>Cook's Assistant.","<navy>tears of guthix" to "<navy>Tears of Guthix.","<navy>Jungle Potion" to "<navy>Jungle Potion.","<navy>The Blood Pact" to "<navy>The Blood Pact.","<col=081190>Imp Catcher</col>" to "<col=081190>Imp Catcher</col>.","<col=081190>Rune Mysteries</col>" to "<col=081190>Rune Mysteries</col>.")
 for((before,after) in cases){val actual=QuestCompletionMessages.format(prefix+before);check(actual==prefix+after){actual};check(QuestCompletionMessages.format(actual)==actual);check(GameMessageFeedback.normalize(prefix+before,ChatType.Game)==actual)}
 check(QuestCompletionMessages.format("An unrelated message.")=="An unrelated message.")
 check(GameMessageFeedback.normalize(prefix+"<navy>cook's assistant",ChatType.Chat)==prefix+"<navy>cook's assistant")
 check(QuestCompletionMessages.format(prefix+"a quest"){"Canonical Quest Title"}==prefix+"Canonical Quest Title.")
 println("PASS: all six completion messages, canonical-title lookup, colour tags, apostrophes, punctuation idempotence and unchanged non-game chat")
}

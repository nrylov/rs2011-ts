import kotlinx.browser.window
import org.khronos.webgl.Uint8Array

actual object SdkBridge {
    // The native handler runs the local on-op script and queues the packet.
    // Returning true prevents the raw dispatch below from sending it twice.
    private fun selectGameTab(opcode: Int, payload: dynamic, length: Int): Boolean {
        val option = intArrayOf(23, 59, 9, 15, 17, 39, 33, 60, 11, 42).indexOf(opcode)
        if (option < 0 || length != 8) return false
        fun byte(index: Int) = (payload[index] as Int) and 255
        val packed = (byte(0) shl 24) or (byte(1) shl 16) or (byte(2) shl 8) or byte(3)
        val windowId = packed ushr 16
        if (windowId != 548 && windowId != 746) return false
        if ((4..7).any { byte(it) != 255 }) return false
        val widget = NpcReference.method2957(-1, (-54).toByte(), packed)
            ?: error("Game tab widget is not loaded")
        val label = widget.aStringArray833?.getOrNull(option) ?: return false
        if (label !in setOf("Combat Styles", "Task System", "Stats", "Quest Journals",
                "Inventory", "Worn Equipment", "Prayer List", "Magic Spellbook",
                "Friends List", "Ignore List", "Clan Chat", "Options", "Emotes",
                "Music Player", "Notes")) return false
        CharacterRenderState.method2780(-1, label, 8.toByte(), option + 1, packed)
        return true
    }

    // Match the local state set by LongKeyNode.method2807 for a map walk.
    // The packet is already queued below; do not invoke the sender a second time.
    private fun markWalkDestination(opcode: Int, payload: dynamic, length: Int) {
        if (opcode != 35 || length != 5) return
        fun byte(index: Int) = (payload[index] as Int) and 255
        val worldY = byte(0) or (byte(1) shl 8)
        val worldX = (byte(3) shl 8) or ((byte(4) - 128) and 255)
        MediaStreamClient.anInt3203 = worldX - ArbVertexProgram.regionTileX
        TerrainChunkBuilder.anInt1548 = worldY - RegionMapDecoder.regionTileY
        ModelKeyBuilder.aBoolean6759 = false
        CubemapTextureGlSource.method2264(false)
    }

    private fun install() {
        val api = js("({version: 1})")
        api.sendPacket = sendPacket@{ opcode: Int, payload: dynamic ->
            check(Client.aAbstractGameSocket_9165 != null) { "Regular game client is disconnected" }
            val length = payload.length as Int
            require(opcode in 0..255 && length in 0..65535)
            if (selectGameTab(opcode, payload, length)) return@sendPacket
            val node = WaterMaterialPass.method2148(FontMetaRef(opcode, length), TheoraVideoStream.aIsaacCipher_9029, -100)
            for (i in 0 until length) node.aClass348_Sub49_Sub2_7116!!.writeByte(false, payload[i] as Int)
            InterfaceComponentGroup.method3243(135, node)
            markWalkDestination(opcode, payload, length)
        }
        api.readyForLogin = { WorldMapRenderer.anInt4674 == 3 && RenderAnimType.anInt2955 == 0 && GlWaterRenderPass.anInt7297 == 0 }
        api.login = { username: String, password: String ->
            check(WorldMapRenderer.anInt4674 == 3 && RenderAnimType.anInt2955 == 0 && GlWaterRenderPass.anInt7297 == 0) { "Wait for the login screen before signing in" }
            require(username.length in 1..12 && password.isNotEmpty()) { "Enter a username and password" }
            if (Client.aAbstractGameSocket_9165 != null) {
                Client.aAbstractGameSocket_9165!!.method1700(36.toByte())
                Client.aAbstractGameSocket_9165 = null
            }
            OpenGlModel.aString5600 = username
            TextureGenerator.aString2496 = password
            ByteBufferStatics.method3379(2, 5)
        }
        api.isConnected = { Client.aAbstractGameSocket_9165 != null }
        window.asDynamic().rs2011Client = api
    }
    actual fun boot() { install() }
    private fun copy(bytes: ByteArray, length: Int): Uint8Array {
        val array = Uint8Array(length)
        for (i in 0 until length) array.asDynamic()[i] = bytes[i].toInt() and 255
        return array
    }
    actual fun login(index: Int, opcode: Int, bytes: ByteArray, length: Int) {
        install()
        val callback = window.asDynamic().rs2011SdkOnLogin
        if (jsTypeOf(callback) == "function") try { callback(index, opcode, copy(bytes, length), OpenGlModel.aString5600) } catch (ignored: dynamic) {}
    }
    actual fun packet(opcode: Int, bytes: ByteArray, length: Int) {
        val callback = window.asDynamic().rs2011SdkOnPacket
        if (jsTypeOf(callback) == "function") try { callback(opcode, copy(bytes, length)) } catch (ignored: dynamic) {}
    }
}

import kotlinx.browser.window
import org.khronos.webgl.Uint8Array

actual object SdkBridge {
    private fun install() {
        val api = js("({version: 1})")
        api.sendPacket = { opcode: Int, payload: dynamic ->
            check(Client.aAbstractGameSocket_9165 != null) { "Regular game client is disconnected" }
            val length = payload.length as Int
            require(opcode in 0..255 && length in 0..65535)
            val node = WaterMaterialPass.method2148(FontMetaRef(opcode, length), TheoraVideoStream.aIsaacCipher_9029, -100)
            for (i in 0 until length) node.aClass348_Sub49_Sub2_7116!!.writeByte(false, payload[i] as Int)
            InterfaceComponentGroup.method3243(135, node)
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

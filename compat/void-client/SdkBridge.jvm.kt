actual object SdkBridge {
    actual fun boot() {}
    actual fun login(index: Int, opcode: Int, bytes: ByteArray, length: Int) {}
    actual fun packet(opcode: Int, bytes: ByteArray, length: Int) {}
}

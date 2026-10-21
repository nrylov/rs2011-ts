/** Optional SDK packet observer. The regular client keeps its own socket and ISAAC state. */
expect object SdkBridge {
    fun boot()
    fun login(index: Int, opcode: Int, bytes: ByteArray, length: Int)
    fun packet(opcode: Int, bytes: ByteArray, length: Int)
}

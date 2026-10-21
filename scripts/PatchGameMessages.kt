import org.jetbrains.org.objectweb.asm.ClassReader
import org.jetbrains.org.objectweb.asm.ClassWriter
import org.jetbrains.org.objectweb.asm.ClassVisitor
import org.jetbrains.org.objectweb.asm.MethodVisitor
import org.jetbrains.org.objectweb.asm.Opcodes
import java.nio.file.Files
import java.nio.file.Path
import java.util.zip.ZipFile

/** Preserve the release class's other methods and ABI; normalize quest completion text before encoding and append the feedback callback. */
object PatchGameMessages {
    @JvmStatic
    fun main(args: Array<String>) {
        val name = "world/gregs/voidps/engine/client/EncodeExtensionsKt.class"
        val bytes = ZipFile(args[0]).use { it.getInputStream(it.getEntry(name)).readBytes() }
        val reader = ClassReader(bytes)
        val writer = ClassWriter(reader, ClassWriter.COMPUTE_MAXS)
        var patched = 0
        reader.accept(object : ClassVisitor(Opcodes.ASM9, writer) {
            override fun visitMethod(access: Int, method: String, descriptor: String, signature: String?, exceptions: Array<out String>?): MethodVisitor {
                val visitor = super.visitMethod(access, method, descriptor, signature, exceptions)
                if (method != "message" || descriptor != "(Lworld/gregs/voidps/engine/entity/character/Character;Ljava/lang/String;Lworld/gregs/voidps/engine/entity/character/player/chat/ChatType;ILjava/lang/String;)V") return visitor
                patched++
                return object : MethodVisitor(Opcodes.ASM9, visitor) {
                    override fun visitCode() {
                        super.visitCode()
                        visitVarInsn(Opcodes.ALOAD, 1)
                        visitVarInsn(Opcodes.ALOAD, 2)
                        visitMethodInsn(Opcodes.INVOKESTATIC, "world/gregs/voidps/engine/client/GameMessageFeedback", "normalize", "(Ljava/lang/String;Lworld/gregs/voidps/engine/entity/character/player/chat/ChatType;)Ljava/lang/String;", false)
                        visitVarInsn(Opcodes.ASTORE, 1)
                    }
                    override fun visitInsn(opcode: Int) {
                        if (opcode == Opcodes.RETURN) {
                            visitVarInsn(Opcodes.ALOAD, 0)
                            visitVarInsn(Opcodes.ALOAD, 1)
                            visitVarInsn(Opcodes.ALOAD, 2)
                            visitMethodInsn(Opcodes.INVOKESTATIC, "world/gregs/voidps/engine/client/GameMessageFeedback", "emit", "(Lworld/gregs/voidps/engine/entity/character/Character;Ljava/lang/String;Lworld/gregs/voidps/engine/entity/character/player/chat/ChatType;)V", false)
                        }
                        super.visitInsn(opcode)
                    }
                }
            }
        }, 0)
        check(patched == 1) { "Expected exactly one compatible message method; refusing to patch this server release" }
        val output = Path.of(args[1], name)
        Files.createDirectories(output.parent)
        Files.write(output, writer.toByteArray())
    }
}

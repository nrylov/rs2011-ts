/** Keep the Kotlin/JS client pumping inbound data even when hidden-page timers are delayed. */
export function patchBackgroundLoop(source:string){
 const replacements:[string,string][]=[
 ['actual fun runLoop(', 'private val inboundLoopWakeups = mutableSetOf<() -> Unit>()\n\nactual fun runLoop('],
 ['    fun tick() {\n        pendingSleepMillis = 0L',`    var timer = 0
    var running = true
    var ticking = false
    var nextTickAt = 0.0
    var wake: (() -> Unit)? = null

    fun stopLoop() {
        running = false
        window.clearTimeout(timer)
        wake?.let { inboundLoopWakeups.remove(it) }
    }

    fun tick() {
        if (!running || ticking) return
        ticking = true
        window.clearTimeout(timer)
        pendingSleepMillis = 0L`],
 ['        } catch (throwable: Throwable) {\n            onError(throwable)',`        } catch (throwable: Throwable) {
            ticking = false
            stopLoop()
            onError(throwable)`],
 ['        if (!more) {\n            onFinally()',`        ticking = false
        if (!more) {
            stopLoop()
            onFinally()`],
 ['        window.setTimeout({ tick() }, pendingSleepMillis.coerceIn(1L, 50L).toInt())',`        val delay = pendingSleepMillis.coerceIn(1L, 50L).toInt()
        nextTickAt = kotlin.js.Date.now() + delay
        timer = window.setTimeout({ tick() }, delay)`],
 ['    window.setTimeout({ tick() }, 0)',`    wake = {
        if (running && !ticking && kotlin.js.Date.now() >= nextTickAt) tick()
    }
    wake?.let { inboundLoopWakeups.add(it) }
    timer = window.setTimeout({ tick() }, 0)`],
 ['internal fun notifyInboundData() {',`internal fun notifyInboundData() {
    // Network tasks are independent of chained DOM timers. Wake only due loops,
    // retain normal pacing, and cancel the old timeout to avoid duplicate ticks.
    for (wake in inboundLoopWakeups.toList()) wake()`],
 ];
 for(const [before,after] of replacements){if(source.split(before).length!==2)throw new Error('Unexpected Kotlin/JS loop source; review background pump anchors before building');source=source.replace(before,after);}
 return source;
}

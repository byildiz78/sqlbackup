export async function register() {
  console.log("[Instrumentation] Starting... Runtime:", process.env.NEXT_RUNTIME)

  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[Instrumentation] Node.js runtime detected, initializing scheduler...")
    try {
      const { initializeScheduler } = await import("./lib/scheduler")
      await initializeScheduler()
      console.log("[Instrumentation] Scheduler initialized successfully")
    } catch (error) {
      console.error("[Instrumentation] Failed to initialize scheduler:", error)
    }
  }
}
